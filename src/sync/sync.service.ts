import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailConnection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailConnectionService } from '../connections/email-connection.service.js';
import { GmailService, GoogleAuthError } from '../integrations/gmail.service.js';
import { EmailCandidateService } from './email-candidate.service.js';
import { BillExtractionService } from './bill-extraction.service.js';

/**
 * "Sync Now" runs inline, inside the same request that triggered it.
 *
 * This used to be a pg-boss background job, but pg-boss's worker only got
 * CPU time while some unrelated HTTP request happened to keep the Vercel
 * function warm — the moment that request's response flushed, the
 * container froze mid-job with no error and no further logs. Since sync is
 * only ever triggered by a user tapping "Sync Now" (no cron, no fan-out),
 * running it inline and awaiting it ties its whole lifetime to one request,
 * which Vercel actually keeps alive until it finishes (up to maxDuration).
 * Each tap is its own isolated invocation, so concurrent users don't block
 * each other — there's just no longer an app-side cap on how many Gmail/
 * Gemini calls run at once across users.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailConnectionService: EmailConnectionService,
    private readonly gmailService: GmailService,
    private readonly emailCandidateService: EmailCandidateService,
    private readonly billExtractionService: BillExtractionService,
  ) {}

  /**
   * Verifies the connection belongs to the logged-in user (same
   * ownership-check pattern as EmailConnectionService.disconnect), marks it
   * `syncing`, runs the sync to completion, and returns its result.
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

    return this.runSync(connection);
  }

  private async runSync(connection: EmailConnection) {
    const connectionId = connection.id;
    this.logger.log(`Starting sync for connection ${connectionId}`);

    const refreshToken = await this.emailConnectionService.getDecryptedRefreshToken(connectionId);
    if (!refreshToken) {
      this.logger.warn(`Connection ${connectionId} has no refresh token — marking needs_reauth`);
      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: { status: 'needs_reauth' },
      });
      return { status: 'needs_reauth' as const };
    }

    // Discovery is cheap (headers-only Gmail calls) so it fetches everything
    // in one go; extraction (Gemini) is the slow part, so it runs in
    // batches until either nothing's left or `deadline` is close — this
    // whole sync must return within one Vercel request (60s maxDuration on
    // Hobby, hard-capped — no warning before it's killed), so `deadline`
    // leaves a safety margin rather than racing that hard cutoff.
    const discoveryLimit = Number(this.config.get<string>('SYNC_DISCOVERY_LIMIT') ?? 200);
    const extractionBatchSize = Number(this.config.get<string>('SYNC_EXTRACTION_BATCH_SIZE') ?? 15);
    const fetchConcurrency = Number(this.config.get<string>('SYNC_FETCH_CONCURRENCY') ?? 5);
    const softBudgetMs = Number(this.config.get<string>('SYNC_SOFT_BUDGET_MS') ?? 50_000);
    const deadline = Date.now() + softBudgetMs;

    try {
      this.logger.log(`[${connectionId}] discovering candidate messages (historyId=${connection.historyId ?? 'none'})`);
      const { messageIds, newHistoryId } = await this.discoverCandidateMessageIds(
        refreshToken,
        connection.historyId,
        discoveryLimit,
      );
      this.logger.log(`[${connectionId}] discovery done — ${messageIds.length} candidate message id(s)`);

      await this.mapWithConcurrency(messageIds, fetchConcurrency, async (messageId, i) => {
        this.logger.log(`[${connectionId}] fetching metadata ${i + 1}/${messageIds.length} — message ${messageId}`);
        const metadata = await this.gmailService.fetchMessageMetadata(refreshToken, messageId);
        await this.emailCandidateService.upsertCandidate({
          userId: connection.userId,
          emailConnectionId: connectionId,
          message: metadata,
        });
      });

      let extractedCount = 0;
      let ranOutOfTime = false;
      while (true) {
        if (Date.now() >= deadline) {
          ranOutOfTime = true;
          this.logger.warn(`[${connectionId}] soft budget hit — stopping extraction early, next tap continues`);
          break;
        }

        const batch = await this.emailCandidateService.findUnprocessed(connectionId, extractionBatchSize);
        if (batch.length === 0) break;

        this.logger.log(`[${connectionId}] extracting batch of ${batch.length} candidate(s)`);
        await this.mapWithConcurrency(batch, fetchConcurrency, (candidate, i) => {
          this.logger.log(`[${connectionId}] extracting ${extractedCount + i + 1} — candidate ${candidate.id}`);
          return this.billExtractionService.processCandidate({
            userId: connection.userId,
            refreshToken,
            candidate,
          });
        });
        extractedCount += batch.length;
      }

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: {
          status: ranOutOfTime ? 'syncing' : 'active',
          lastSyncedAt: new Date(),
          historyId: newHistoryId ?? connection.historyId,
        },
      });
      this.logger.log(
        `Sync ${ranOutOfTime ? 'paused (ran out of time)' : 'complete'} for connection ${connectionId}: ` +
          `${messageIds.length} candidate(s) found, ${extractedCount} extracted`,
      );
      return {
        status: ranOutOfTime ? ('syncing' as const) : ('active' as const),
        candidatesFound: messageIds.length,
        candidatesExtracted: extractedCount,
        hasMore: ranOutOfTime,
      };
    } catch (error) {
      if (error instanceof GoogleAuthError) {
        this.logger.warn(`Connection ${connectionId} needs reauth: ${error.message}`);
        await this.prisma.emailConnection.update({
          where: { id: connectionId },
          data: { status: 'needs_reauth' },
        });
        return { status: 'needs_reauth' as const };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync failed for connection ${connectionId}: ${message}`);
      // Leave status as 'syncing' so a re-click can pick it back up rather
      // than silently reporting 'active' on a run that didn't finish.
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
    discoveryLimit: number,
  ): Promise<{ messageIds: string[]; newHistoryId: string | null }> {
    if (historyId) {
      this.logger.log(`Incremental sync via history.list from historyId ${historyId}`);
      const history = await this.gmailService.fetchHistorySince(refreshToken, historyId);
      if (!history.historyStale) {
        return { messageIds: history.candidateMessageIds, newHistoryId: history.newHistoryId };
      }
      this.logger.warn(`historyId ${historyId} stale — falling back to full search`);
    } else {
      this.logger.log('No stored historyId — running full keyword search');
    }

    const messageIds = await this.gmailService.searchCandidateMessageIds(refreshToken, discoveryLimit);
    const newHistoryId = await this.gmailService.getCurrentHistoryId(refreshToken);
    return { messageIds, newHistoryId };
  }

  /**
   * Runs `fn` over `items` with at most `limit` in flight at once — cuts
   * wall-clock time for the Gmail/Gemini calls in the sync loop (each one
   * is mostly network wait) without unbounded fan-out per request.
   */
  private async mapWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await fn(items[index], index);
      }
    });
    await Promise.all(workers);
  }
}
