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

    const maxCandidates = Number(this.config.get<string>('SYNC_MAX_CANDIDATES_PER_RUN') ?? 50);

    try {
      this.logger.log(`[${connectionId}] discovering candidate messages (historyId=${connection.historyId ?? 'none'})`);
      const { messageIds, newHistoryId } = await this.discoverCandidateMessageIds(
        refreshToken,
        connection.historyId,
      );
      this.logger.log(`[${connectionId}] discovery done — ${messageIds.length} candidate message id(s)`);

      for (const [i, messageId] of messageIds.entries()) {
        this.logger.log(`[${connectionId}] fetching metadata ${i + 1}/${messageIds.length} — message ${messageId}`);
        const metadata = await this.gmailService.fetchMessageMetadata(refreshToken, messageId);
        await this.emailCandidateService.upsertCandidate({
          userId: connection.userId,
          emailConnectionId: connectionId,
          message: metadata,
        });
      }

      const unprocessed = await this.emailCandidateService.findUnprocessed(connectionId, maxCandidates);
      this.logger.log(`[${connectionId}] extracting ${unprocessed.length} unprocessed candidate(s)`);
      for (const [i, candidate] of unprocessed.entries()) {
        this.logger.log(`[${connectionId}] extracting ${i + 1}/${unprocessed.length} — candidate ${candidate.id}`);
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
      return {
        status: 'active' as const,
        candidatesFound: messageIds.length,
        candidatesExtracted: unprocessed.length,
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

    const messageIds = await this.gmailService.searchCandidateMessageIds(refreshToken);
    const newHistoryId = await this.gmailService.getCurrentHistoryId(refreshToken);
    return { messageIds, newHistoryId };
  }
}
