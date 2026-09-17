import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UserBillerService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const [userBillers, billCounts, connections] = await Promise.all([
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
      })),
      total: userBillers.length,
      // 'syncing' is a healthy in-progress state, not a problem — only flag a real
      // issue (needs_reauth or anything else unexpected), so this banner doesn't
      // flash on for every ordinary sync run.
      gmailNeedsReauth: connections.some((c) => c.status !== 'active' && c.status !== 'syncing'),
    };
  }

  /**
   * Finds this user's existing link to a biller (by catalog biller id when
   * one was resolved, otherwise by display name for unrecognized senders),
   * creating one if none exists. Used by BillExtractionService when writing
   * a newly extracted bill — every bill needs a UserBiller to hang off of,
   * recognized or not.
   */
  async findOrCreateForUser(userId: string, billerId: string | null, displayName: string) {
    const existing = await this.prisma.userBiller.findFirst({
      where: billerId ? { userId, billerId } : { userId, billerId: null, displayName },
    });
    if (existing) return existing;

    return this.prisma.userBiller.create({
      data: { userId, billerId, displayName, createdVia: 'sync' },
    });
  }
}
