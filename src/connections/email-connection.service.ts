import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  private readonly logger = new Logger(EmailConnectionService.name);

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
        // Disconnected inboxes are retained only so a reconnect can reuse
        // their id and skip re-extraction — they aren't connections the user
        // still has, so they never surface.
        where: { userId, status: { not: 'revoked' } },
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

  /**
   * Soft disconnect: credentials are revoked at Google and cleared, but the
   * row itself stays.
   *
   * Deleting it instead used to cascade away every EmailCandidate for that
   * inbox. Reconnecting the same Google account then produced a *new*
   * connection id, so every message looked unseen again — the whole mailbox
   * was re-fetched and re-extracted (re-paying Gemini per message), and any
   * bill the user had deliberately deleted came back, sitting alongside the
   * now-orphaned originals. Keeping the row means a reconnect upserts onto
   * it (see the `userId_provider_providerAccountId` key in upsertConnection),
   * candidates stay `processed`, and none of that happens.
   *
   * The tradeoff: "disconnect" no longer erases the candidate metadata
   * (subject/sender) already extracted from that inbox — that would need a
   * separate, explicit delete-my-data action.
   */
  async disconnect(userId: string, connectionId: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.userId !== userId) throw new ForbiddenException();

    if (connection.refreshToken) {
      await this.revokeAtGoogle(this.tokenEncryption.decrypt(connection.refreshToken));
    }

    return this.prisma.emailConnection.update({
      where: { id: connectionId },
      data: { status: 'revoked', accessToken: null, refreshToken: null, historyId: null },
      select: { id: true, status: true },
    });
  }

  /**
   * Revokes every connected inbox's grant at Google ahead of an *immediate*
   * account deletion. The rows themselves aren't touched here — the caller
   * deletes the User row right after this, which cascades away every
   * EmailConnection anyway — this is purely about telling Google to stop
   * honoring the tokens before they become unreachable.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const connections = await this.prisma.emailConnection.findMany({
      where: { userId, refreshToken: { not: null } },
      select: { refreshToken: true },
    });
    await Promise.all(
      connections.map((c) => this.revokeAtGoogle(this.tokenEncryption.decrypt(c.refreshToken!))),
    );
  }

  /**
   * Same as calling [disconnect] on every one of a user's inboxes — used
   * when an account moves to `pending_deletion` (bill data retained, so the
   * User row survives). Unlike [revokeAllForUser], this also updates each
   * row so a stray sync can't quietly reactivate a connection the user just
   * asked to walk away from.
   */
  async disconnectAllForUser(userId: string): Promise<void> {
    const connections = await this.prisma.emailConnection.findMany({
      where: { userId, status: { not: 'revoked' } },
      select: { id: true },
    });
    await Promise.all(connections.map((c) => this.disconnect(userId, c.id)));
  }

  /**
   * Best-effort — clearing our copy of the token is what actually stops this
   * app reading the mailbox, so a failure here (network, already-revoked
   * grant) must not leave the user unable to disconnect.
   */
  private async revokeAtGoogle(refreshToken: string): Promise<void> {
    try {
      const resp = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
      if (!resp.ok) {
        this.logger.warn(`Google token revocation returned ${resp.status}; clearing local copy anyway`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Google token revocation failed (${message}); clearing local copy anyway`);
    }
  }

  /**
   * Returns the connection's decrypted refresh token, or null when there
   * isn't one (disconnected inbox — see [disconnect]). Callers treat null as
   * "this connection can't be synced"; GmailService's OAuth2 client handles
   * minting access tokens from it, so nothing else needs refreshing here.
   */
  async getDecryptedRefreshToken(connectionId: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection?.refreshToken) return null;
    return this.tokenEncryption.decrypt(connection.refreshToken);
  }

  async markSynced(connectionId: string) {
    return this.prisma.emailConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    });
  }
}
