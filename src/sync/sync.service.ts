import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PgBossService } from './pg-boss.service.js';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pgBoss: PgBossService,
  ) {}

  /**
   * "Sync Now" — verifies the connection belongs to the logged-in user
   * (same ownership-check pattern as EmailConnectionService.disconnect),
   * marks it `syncing`, and submits a pg-boss job. Returns immediately;
   * the actual Gmail fetch + extraction happens in PgBossService's worker.
   */
  async startSync(userId: string, connectionId: string) {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.userId !== userId) throw new ForbiddenException();

    await this.prisma.emailConnection.update({
      where: { id: connectionId },
      data: { status: 'syncing' },
    });

    const jobId = await this.pgBoss.submitSyncJob(connectionId);

    return { status: 'syncing', jobId };
  }
}
