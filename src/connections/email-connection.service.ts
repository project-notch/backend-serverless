import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenEncryptionService } from './token-encryption.service.js';

interface UpsertConnectionInput {
  userId: string;
  provider: string;
  providerAccountId: string;
  emailAddress: string;
  displayName?: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAt: Date;
}

@Injectable()
export class EmailConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  async upsertConnection(input: UpsertConnectionInput) {
    const encryptedRefreshToken = this.tokenEncryption.encrypt(input.refreshToken);
    const key = {
      userId: input.userId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    };

    const existing = await this.prisma.emailConnection.findUnique({
      where: { userId_provider_providerAccountId: key },
      select: { id: true },
    });

    // Every inbox always gets a nickname — "Inbox N" (by connection order)
    // when the user hasn't named it, never a bare unlabeled connection.
    const displayName = existing ? input.displayName : input.displayName ?? (await this._nextInboxNickname(input.userId));

    return this.prisma.emailConnection.upsert({
      where: {
        userId_provider_providerAccountId: key,
      },
      update: {
        emailAddress: input.emailAddress,
        // Reconnecting without naming the inbox keeps whatever nickname it already had.
        ...(displayName ? { displayName } : {}),
        accessToken: input.accessToken,
        refreshToken: encryptedRefreshToken,
        scope: input.scope,
        expiresAt: input.expiresAt,
        status: 'active',
      },
      create: {
        ...key,
        emailAddress: input.emailAddress,
        displayName,
        accessToken: input.accessToken,
        refreshToken: encryptedRefreshToken,
        scope: input.scope,
        expiresAt: input.expiresAt,
        status: 'active',
      },
    });
  }

  private async _nextInboxNickname(userId: string): Promise<string> {
    const count = await this.prisma.emailConnection.count({ where: { userId } });
    return `Inbox ${count + 1}`;
  }

  /**
   * Catches inboxes connected before nicknames were assigned at creation
   * time — numbers them "Inbox N" by connection order, leaving any
   * already-named connection untouched.
   */
  private async _backfillMissingNicknames(userId: string): Promise<void> {
    const connections = await this.prisma.emailConnection.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, displayName: true },
    });

    await Promise.all(
      connections
        .map((c, i) => ({ ...c, position: i + 1 }))
        .filter((c) => !c.displayName)
        .map((c) =>
          this.prisma.emailConnection.update({
            where: { id: c.id },
            data: { displayName: `Inbox ${c.position}` },
          }),
        ),
    );
  }

  async listForUser(userId: string) {
    await this._backfillMissingNicknames(userId);

    const [connections, bills] = await Promise.all([
      this.prisma.emailConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          provider: true,
          emailAddress: true,
          displayName: true,
          status: true,
          lastSyncedAt: true,
          createdAt: true,
          // Deliberately excludes accessToken/refreshToken — never return
          // tokens to the client, even the owning user.
        },
      }),
      // Which billers came out of which inbox is only knowable through the
      // candidate the bill was extracted from — that's what carries the
      // connection id.
      this.prisma.bill.findMany({
        where: { userId, userBillerId: { not: null }, emailCandidateId: { not: null } },
        select: {
          emailCandidate: { select: { emailConnectionId: true } },
          userBiller: {
            select: { id: true, displayName: true, biller: { select: { canonicalName: true } } },
          },
        },
      }),
    ]);

    const billersByConnection = new Map<
      string,
      Map<string, { id: string; name: string; billCount: number }>
    >();

    for (const bill of bills) {
      const connectionId = bill.emailCandidate?.emailConnectionId;
      const userBiller = bill.userBiller;
      if (!connectionId || !userBiller) continue;

      let byBiller = billersByConnection.get(connectionId);
      if (!byBiller) {
        byBiller = new Map();
        billersByConnection.set(connectionId, byBiller);
      }

      const existing = byBiller.get(userBiller.id);
      if (existing) {
        existing.billCount += 1;
      } else {
        byBiller.set(userBiller.id, {
          id: userBiller.id,
          name: userBiller.displayName || userBiller.biller?.canonicalName || 'Unknown biller',
          billCount: 1,
        });
      }
    }

    return connections.map((connection) => {
      const billers = [...(billersByConnection.get(connection.id)?.values() ?? [])].sort(
        (a, b) => b.billCount - a.billCount,
      );
      return { ...connection, billers };
    });
  }

  async rename(userId: string, connectionId: string, displayName: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.userId !== userId) throw new ForbiddenException();

    const trimmed = displayName.trim();
    return this.prisma.emailConnection.update({
      where: { id: connectionId },
      data: { displayName: trimmed || null },
      select: {
        id: true,
        provider: true,
        emailAddress: true,
        displayName: true,
        status: true,
        lastSyncedAt: true,
        createdAt: true,
      },
    });
  }

  async disconnect(userId: string, connectionId: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.userId !== userId) throw new ForbiddenException();

    return this.prisma.emailConnection.delete({ where: { id: connectionId } });
  }

  /**
   * Returns the connection's decrypted refresh token. Does not refresh the
   * access token itself — that needs an OAuth2 client (GmailService's
   * territory), not yet wired up here.
   */
  async getDecryptedRefreshToken(connectionId: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) return null;
    return this.tokenEncryption.decrypt(connection.refreshToken);
  }

  async markSynced(connectionId: string) {
    return this.prisma.emailConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    });
  }
}
