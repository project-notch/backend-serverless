import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillerCatalogService } from './biller-catalog.service.js';

@Injectable()
export class UserBillerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billerCatalog: BillerCatalogService,
  ) {}

  /**
   * Manually adds a biller for this user. Routes the name through the same
   * catalog resolution as sync (so "Netflix" typed here and "Netflix, Inc."
   * seen in a future email both land on one Biller), and returns the
   * existing link untouched if the user already has this biller — adding
   * one twice isn't an error, just a no-op.
   */
  async createManual(userId: string, name: string) {
    const trimmed = name.trim();
    const biller = await this.billerCatalog.findOrCreateByName(trimmed);
    const userBiller = await this.findOrCreateForUser(userId, biller?.id ?? null, trimmed);
    const billCount = await this.prisma.bill.count({ where: { userBillerId: userBiller.id } });
    return {
      id: userBiller.id,
      name: userBiller.displayName,
      status: userBiller.status,
      billCount,
      inboxLabel: null,
    };
  }

  async listForUser(userId: string) {
    const [userBillers, billCounts, connections, inboxByBiller] = await Promise.all([
      this.prisma.userBiller.findMany({
        where: { userId },
        include: { biller: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.bill.groupBy({
        by: ['userBillerId'],
        where: { userId, userBillerId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.emailConnection.findMany({
        where: { userId },
        select: { status: true },
      }),
      this._inboxLabelByBiller(userId),
    ]);

    const billCountByUserBillerId = new Map(
      billCounts.map((row) => [row.userBillerId, row._count._all]),
    );

    return {
      billers: userBillers.map((ub) => ({
        id: ub.id,
        name: ub.displayName || ub.biller?.canonicalName || 'Unknown biller',
        status: ub.status,
        billCount: billCountByUserBillerId.get(ub.id) ?? 0,
        inboxLabel: inboxByBiller.get(ub.id) ?? null,
      })),
      total: userBillers.length,
      // 'syncing' is a healthy in-progress state, not a problem — only flag a real
      // issue (needs_reauth or anything else unexpected), so this banner doesn't
      // flash on for every ordinary sync run.
      gmailNeedsReauth: connections.some((c) => c.status !== 'active' && c.status !== 'syncing'),
    };
  }

  /**
   * Which inbox each biller's bills came from — only knowable through the
   * candidate a bill was extracted from, which carries the connection id.
   * A biller could in principle span more than one inbox; this just takes
   * whichever connection its most recent bill came from, since the card
   * only has room to show one label. Mirrors the equivalent lookup in
   * EmailConnectionService.listForUser, but keyed the other way round.
   */
  private async _inboxLabelByBiller(userId: string): Promise<Map<string, string>> {
    const bills = await this.prisma.bill.findMany({
      where: { userId, userBillerId: { not: null }, emailCandidateId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        userBillerId: true,
        emailCandidate: { select: { emailConnection: { select: { displayName: true, emailAddress: true } } } },
      },
    });

    const labelByBiller = new Map<string, string>();
    for (const bill of bills) {
      const userBillerId = bill.userBillerId;
      const connection = bill.emailCandidate?.emailConnection;
      if (!userBillerId || !connection || labelByBiller.has(userBillerId)) continue;
      labelByBiller.set(userBillerId, connection.displayName || connection.emailAddress);
    }
    return labelByBiller;
  }

  /** Updates a user's own biller — display name and/or active status. */
  async update(userId: string, userBillerId: string, changes: { displayName?: string; status?: string }) {
    const userBiller = await this.prisma.userBiller.findUnique({ where: { id: userBillerId } });
    if (!userBiller) throw new NotFoundException('Biller not found');
    if (userBiller.userId !== userId) throw new ForbiddenException();

    const updated = await this.prisma.userBiller.update({
      where: { id: userBillerId },
      data: changes,
    });

    return { id: updated.id, name: updated.displayName, status: updated.status };
  }

  /**
   * Deletes a user's biller. By default its bills aren't touched
   * (userBillerId is nullable) — they just fall back to "no biller" rather
   * than vanishing, since a bill is the user's financial record and
   * deleting the biller grouping shouldn't delete that on its own. Passing
   * `deleteBills: true` is the explicit "wipe the history too" choice —
   * the caller must have confirmed that with the user first.
   */
  async remove(userId: string, userBillerId: string, deleteBills = false): Promise<void> {
    const userBiller = await this.prisma.userBiller.findUnique({ where: { id: userBillerId } });
    if (!userBiller) throw new NotFoundException('Biller not found');
    if (userBiller.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      deleteBills
        ? this.prisma.bill.deleteMany({ where: { userBillerId } })
        : this.prisma.bill.updateMany({ where: { userBillerId }, data: { userBillerId: null } }),
      this.prisma.userBiller.delete({ where: { id: userBillerId } }),
    ]);
  }

  /**
   * Finds this user's existing link to a biller (by catalog biller id when
   * one was resolved, otherwise by display name for unrecognized senders),
   * creating one if none exists. Used by BillExtractionService when writing
   * a newly extracted bill — every bill needs a UserBiller to hang off of,
   * recognized or not.
   *
   * An existing link the user has switched to `inactive` is deliberately
   * NOT reused — that's what "inactive" means: this biller's keywords stop
   * absorbing new bills for this user. A fresh (active) link is created
   * instead, so the bill still lands somewhere rather than being dropped.
   */
  async findOrCreateForUser(userId: string, billerId: string | null, displayName: string) {
    const existing = await this.prisma.userBiller.findFirst({
      where: billerId ? { userId, billerId } : { userId, billerId: null, displayName },
    });
    if (existing && existing.status !== 'inactive') return existing;

    return this.prisma.userBiller.create({
      data: { userId, billerId, displayName, createdVia: 'sync' },
    });
  }
}
