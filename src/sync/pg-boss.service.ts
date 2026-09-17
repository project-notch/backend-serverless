import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailConnectionService } from '../connections/email-connection.service.js';
import { GmailService, GoogleAuthError } from '../integrations/gmail.service.js';
import { EmailCandidateService } from './email-candidate.service.js';
import { BillExtractionService } from './bill-extraction.service.js';

export const SYNC_QUEUE_NAME = 'sync-connection';

interface SyncJobData {
  connectionId: string;
}

/**
 * pg-boss wiring: a durable, Postgres-backed job queue running in-process
 * inside this same Nest app (no separate worker deploy at this scale). Uses
 * the same DATABASE_URL as Prisma — pg-boss creates/manages its own
 * `pgboss.*` schema alongside the app's tables.
 *
 * Concurrency is capped via pg-boss's own `localConcurrency` (v12+ renamed
 * from `teamSize`), so however many users click "Sync Now" at once, only
 * SYNC_QUEUE_CONCURRENCY syncs run concurrently — the rest sit `created` in
 * `pgboss.job` until a worker slot frees up.
 */
@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private readonly boss: PgBoss;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailConnectionService: EmailConnectionService,
    private readonly gmailService: GmailService,
    private readonly emailCandidateService: EmailCandidateService,
    private readonly billExtractionService: BillExtractionService,
  ) {
    this.boss = new PgBoss(this.config.getOrThrow<string>('DATABASE_URL'));
    this.boss.on('error', (error: Error) => this.logger.error(`pg-boss error: ${error.message}`));
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();

    const concurrency = Number(this.config.get<string>('SYNC_QUEUE_CONCURRENCY') ?? 8);
    await this.boss.createQueue(SYNC_QUEUE_NAME);
    await this.boss.work<SyncJobData>(
      SYNC_QUEUE_NAME,
      { localConcurrency: concurrency },
      async ([job]: Job<SyncJobData>[]) => {
        await this.handleSyncJob(job.data.connectionId);
      },
    );
    this.logger.log(
      `pg-boss started — '${SYNC_QUEUE_NAME}' worker registered (localConcurrency=${concurrency})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
  }

  /**
   * Submits a sync job and returns immediately — the caller (SyncService)
   * is expected to have already set the connection to `syncing` and
   * responds 202 without waiting on this job to finish. `retryLimit`/
   * `retryBackoff` cover transient Gemini 429/5xx failures inside the job;
   * a job that still fails after retries stops there rather than being
   * lost (unlike an in-memory-only queue).
   */
  async submitSyncJob(connectionId: string): Promise<string | null> {
    return this.boss.send(SYNC_QUEUE_NAME, { connectionId } satisfies SyncJobData, {
      retryLimit: 3,
      retryBackoff: true,
    });
  }

  private async handleSyncJob(connectionId: string): Promise<void> {
    this.logger.log(`Starting sync for connection ${connectionId}`);

    const connection = await this.prisma.emailConnection.findUnique({ where: { id: connectionId } });
    if (!connection) {
      this.logger.warn(`Sync job for missing connection ${connectionId} — skipping`);
      return;
    }

    const refreshToken = await this.emailConnectionService.getDecryptedRefreshToken(connectionId);
    if (!refreshToken) {
      this.logger.warn(`Connection ${connectionId} has no refresh token — marking needs_reauth`);
      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: { status: 'needs_reauth' },
      });
      return;
    }

    const maxCandidates = Number(this.config.get<string>('SYNC_MAX_CANDIDATES_PER_RUN') ?? 50);

    try {
      const { messageIds, newHistoryId } = await this.discoverCandidateMessageIds(
        refreshToken,
        connection.historyId,
      );

      for (const messageId of messageIds) {
        const metadata = await this.gmailService.fetchMessageMetadata(refreshToken, messageId);
        await this.emailCandidateService.upsertCandidate({
          userId: connection.userId,
          emailConnectionId: connectionId,
          message: metadata,
        });
      }

      const unprocessed = await this.emailCandidateService.findUnprocessed(connectionId, maxCandidates);
      for (const candidate of unprocessed) {
        await this.billExtractionService.processCandidate({
          userId: connection.userId,
          refreshToken,
          candidate,
        });
      }

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: { status: 'active', lastSyncedAt: new Date(), historyId: newHistoryId ?? connection.historyId },
      });
      this.logger.log(
        `Sync complete for connection ${connectionId}: ${messageIds.length} candidate(s) found, ${unprocessed.length} extracted`,
      );
    } catch (error) {
      if (error instanceof GoogleAuthError) {
        this.logger.warn(`Connection ${connectionId} needs reauth: ${error.message}`);
        await this.prisma.emailConnection.update({
          where: { id: connectionId },
          data: { status: 'needs_reauth' },
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync job failed for connection ${connectionId}: ${message}`);
      // Leave status as 'syncing' so pg-boss's redelivery on retry (or a
      // future manual re-click) can pick it back up rather than silently
      // reporting 'active' on a run that didn't actually finish.
      throw error;
    }
  }

  /**
   * First sync (no stored historyId) or a stale historyId (Google 404s it)
   * both fall back to a full keyword search; otherwise uses history.list
   * for a cheap incremental fetch. Ported incremental behavior — new vs.
   * the POC, which always did a full search.
   */
  private async discoverCandidateMessageIds(
    refreshToken: string,
    historyId: string | null,
  ): Promise<{ messageIds: string[]; newHistoryId: string | null }> {
    if (historyId) {
      const history = await this.gmailService.fetchHistorySince(refreshToken, historyId);
      if (!history.historyStale) {
        return { messageIds: history.candidateMessageIds, newHistoryId: history.newHistoryId };
      }
    }

    const messageIds = await this.gmailService.searchCandidateMessageIds(refreshToken);
    const newHistoryId = await this.gmailService.getCurrentHistoryId(refreshToken);
    return { messageIds, newHistoryId };
  }
}
