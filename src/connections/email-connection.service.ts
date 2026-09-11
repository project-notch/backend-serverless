import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenEncryptionService } from './token-encryption.service.js';

interface UpsertConnectionInput {
  userId: string;
  provider: string;
  providerAccountId: string;
  emailAddress: string;
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

    return this.prisma.emailConnection.upsert({
      where: {
        userId_provider_providerAccountId: key,
      },
      update: {
        emailAddress: input.emailAddress,
        accessToken: input.accessToken,
        refreshToken: encryptedRefreshToken,
        scope: input.scope,
        expiresAt: input.expiresAt,
        status: 'active',
      },
      create: {
        ...key,
        emailAddress: input.emailAddress,
        accessToken: input.accessToken,
        refreshToken: encryptedRefreshToken,
        scope: input.scope,
        expiresAt: input.expiresAt,
        status: 'active',
      },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.emailConnection.findMany({
      where: { userId },
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
