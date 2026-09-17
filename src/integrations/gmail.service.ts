import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { BILL_KEYWORDS } from '../sync/keyword-filter.service.js';

export interface FetchedMessage {
  gmailMessageId: string;
  subject: string;
  sender: string;
  receivedAt: Date | null;
  bodyText: string;
  pdfAttachments: { filename: string; data: Buffer }[];
}

export interface MessageMetadata {
  gmailMessageId: string;
  subject: string;
  sender: string;
  receivedAt: Date | null;
}

export interface HistoryFetchResult {
  /** Message ids added since `startHistoryId` that also pass the keyword filter. */
  candidateMessageIds: string[];
  /** The mailbox's current historyId, to persist for the next incremental sync. */
  newHistoryId: string | null;
  /** True when `startHistoryId` was too old/invalid (Google returns 404) — caller should fall back to a full search. */
  historyStale: boolean;
}

/**
 * Thrown when Google rejects the refresh token itself (revoked/expired
 * grant) — distinct from any other API error, since the caller
 * (SyncService's job handler) needs to flip the connection to
 * `needs_reauth` specifically on this failure, not on a generic error.
 */
export class GoogleAuthError extends Error {}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(private readonly config: ConfigService) {}

  private buildOAuth2Client(refreshToken: string) {
    const client = new google.auth.OAuth2(
      this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
    );
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  private getGmailClient(refreshToken: string): gmail_v1.Gmail {
    return google.gmail({ version: 'v1', auth: this.buildOAuth2Client(refreshToken) });
  }

  private isAuthError(error: unknown): boolean {
    const status = (error as { code?: number; response?: { status?: number } })?.code
      ?? (error as { response?: { status?: number } })?.response?.status;
    // invalid_grant (revoked/expired refresh token) surfaces as 400 or 401
    // depending on which Google endpoint rejects it.
    return status === 400 || status === 401;
  }

  private isNotFound(error: unknown): boolean {
    const status = (error as { code?: number; response?: { status?: number } })?.code
      ?? (error as { response?: { status?: number } })?.response?.status;
    return status === 404;
  }

  /**
   * Gmail search query for a full keyword-matched mailbox scan — ported
   * verbatim from the POC's `build_query()`
   * (`demo-runs/bill-detector-poc/src/stage1_gmail_scrape.py`).
   */
  buildQuery(): string {
    const keywordClause = BILL_KEYWORDS.map((kw) => (kw.includes(' ') ? `"${kw}"` : kw)).join(' OR ');
    return `in:inbox (${keywordClause})`;
  }

  /**
   * Full keyword search — the "first sync" / fallback path. Ported from the
   * POC's `main()` search step (`messages.list` with the keyword query).
   */
  async searchCandidateMessageIds(refreshToken: string, maxResults = 50): Promise<string[]> {
    try {
      const gmail = this.getGmailClient(refreshToken);
      const resp = await gmail.users.messages.list({
        userId: 'me',
        q: this.buildQuery(),
        maxResults,
      });
      return (resp.data.messages ?? []).map((m) => m.id!).filter(Boolean);
    } catch (error) {
      if (this.isAuthError(error)) throw new GoogleAuthError('Gmail refresh token rejected');
      throw error;
    }
  }

  /**
   * Incremental fetch via `history.list` — new vs. the POC, which always
   * did a full search. Falls back to signalling staleness (caller should
   * then run `searchCandidateMessageIds`) when `startHistoryId` is too old,
   * per Gmail API's documented 404 behavior for expired history ids.
   */
  async fetchHistorySince(refreshToken: string, startHistoryId: string): Promise<HistoryFetchResult> {
    const gmail = this.getGmailClient(refreshToken);
    try {
      const messageIds = new Set<string>();
      let pageToken: string | undefined;
      let latestHistoryId: string | null = null;

      do {
        const resp = await gmail.users.history.list({
          userId: 'me',
          startHistoryId,
          historyTypes: ['messageAdded'],
          pageToken,
        });
        for (const record of resp.data.history ?? []) {
          for (const added of record.messagesAdded ?? []) {
            if (added.message?.id) messageIds.add(added.message.id);
          }
        }
        if (resp.data.historyId) latestHistoryId = resp.data.historyId;
        pageToken = resp.data.nextPageToken ?? undefined;
      } while (pageToken);

      // history.list doesn't support Gmail's search-query syntax, so each
      // added message is re-checked against the keyword list here instead
      // of at the query level (mirrors KeywordFilterService.isCandidate).
      const candidateMessageIds: string[] = [];
      for (const id of messageIds) {
        const meta = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From'],
        });
        const headers = meta.data.payload?.headers ?? [];
        const subject = this.getHeader(headers, 'Subject') ?? '';
        const snippet = meta.data.snippet ?? '';
        if (BILL_KEYWORDS.some((kw) => `${subject} ${snippet}`.toLowerCase().includes(kw))) {
          candidateMessageIds.push(id);
        }
      }

      const newHistoryId = latestHistoryId ?? (await this.getCurrentHistoryId(refreshToken));
      return { candidateMessageIds, newHistoryId, historyStale: false };
    } catch (error) {
      if (this.isAuthError(error)) throw new GoogleAuthError('Gmail refresh token rejected');
      if (this.isNotFound(error)) {
        this.logger.warn(`historyId ${startHistoryId} is stale — falling back to full search`);
        return { candidateMessageIds: [], newHistoryId: null, historyStale: true };
      }
      throw error;
    }
  }

  async getCurrentHistoryId(refreshToken: string): Promise<string | null> {
    try {
      const gmail = this.getGmailClient(refreshToken);
      const resp = await gmail.users.getProfile({ userId: 'me' });
      return resp.data.historyId ?? null;
    } catch (error) {
      if (this.isAuthError(error)) throw new GoogleAuthError('Gmail refresh token rejected');
      throw error;
    }
  }

  /**
   * Cheap headers-only fetch, used when persisting a new EmailCandidate row
   * — avoids pulling full body/PDF content twice (once at candidate-persist
   * time, again at extraction time) for the same message.
   */
  async fetchMessageMetadata(refreshToken: string, messageId: string): Promise<MessageMetadata> {
    try {
      const gmail = this.getGmailClient(refreshToken);
      const resp = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });
      const headers = resp.data.payload?.headers ?? [];
      const dateHeader = this.getHeader(headers, 'Date');
      return {
        gmailMessageId: messageId,
        subject: this.getHeader(headers, 'Subject') ?? '(no subject)',
        sender: this.getHeader(headers, 'From') ?? '(unknown sender)',
        receivedAt: dateHeader ? new Date(dateHeader) : null,
      };
    } catch (error) {
      if (this.isAuthError(error)) throw new GoogleAuthError('Gmail refresh token rejected');
      throw error;
    }
  }

  /**
   * Fetches one message's full content — headers, body text, and any PDF
   * attachments. Ported from the POC's `extract_body_text` /
   * `extract_pdf_attachments`.
   */
  async fetchMessage(refreshToken: string, messageId: string): Promise<FetchedMessage> {
    try {
      const gmail = this.getGmailClient(refreshToken);
      const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const payload = msg.data.payload ?? {};
      const headers = payload.headers ?? [];

      const subject = this.getHeader(headers, 'Subject') ?? '(no subject)';
      const sender = this.getHeader(headers, 'From') ?? '(unknown sender)';
      const dateHeader = this.getHeader(headers, 'Date');

      const pdfAttachments = await this.extractPdfAttachments(gmail, messageId, payload);
      const bodyText = this.extractBodyText(payload);

      return {
        gmailMessageId: messageId,
        subject,
        sender,
        receivedAt: dateHeader ? new Date(dateHeader) : null,
        bodyText,
        pdfAttachments,
      };
    } catch (error) {
      if (this.isAuthError(error)) throw new GoogleAuthError('Gmail refresh token rejected');
      throw error;
    }
  }

  private getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string | null {
    const match = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
    return match?.value ?? null;
  }

  private extractBodyText(payload: gmail_v1.Schema$MessagePart): string {
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }
    for (const part of payload.parts ?? []) {
      const text = this.extractBodyText(part);
      if (text) return text;
    }
    return '';
  }

  private async extractPdfAttachments(
    gmail: gmail_v1.Gmail,
    messageId: string,
    payload: gmail_v1.Schema$MessagePart,
  ): Promise<{ filename: string; data: Buffer }[]> {
    const attachments: { filename: string; data: Buffer }[] = [];
    for (const part of payload.parts ?? []) {
      const filename = part.filename ?? '';
      const attachmentId = part.body?.attachmentId;
      if (filename.toLowerCase().endsWith('.pdf') && attachmentId) {
        const att = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId,
          id: attachmentId,
        });
        if (att.data.data) {
          attachments.push({ filename, data: Buffer.from(att.data.data, 'base64url') });
        }
      }
      attachments.push(...(await this.extractPdfAttachments(gmail, messageId, part)));
    }
    return attachments;
  }
}
