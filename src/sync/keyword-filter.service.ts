import { Injectable } from '@nestjs/common';

/**
 * Candidate bill keywords — ported verbatim from the Python POC's Stage 1
 * cheap filter (`demo-runs/bill-detector-poc/src/stage1_gmail_scrape.py`,
 * `BILL_KEYWORDS`). Covers common billing vocabulary seen across
 * utility/telecom/subscription invoices.
 */
export const BILL_KEYWORDS: string[] = [
  'bill',
  'invoice',
  'payment due',
  'amount due',
  'statement',
  'outstanding balance',
  'total payable',
  'due date',
  'receipt',
  'subscription renewal',
  'auto-pay',
  'renews on',
  'automatically renew',
  'auto-renew',
  'renewal date',
  'your subscription',
];

@Injectable()
export class KeywordFilterService {
  /**
   * Gmail search query for a full keyword-matched mailbox scan — ported from
   * the POC's `build_query()`. Gmail's own full-text search matches these
   * against subject, body, and sender together.
   */
  buildGmailQuery(): string {
    const keywordClause = BILL_KEYWORDS.map((kw) =>
      kw.includes(' ') ? `"${kw}"` : kw,
    ).join(' OR ');
    return `in:inbox (${keywordClause})`;
  }

  /**
   * Used for the incremental (`history.list`) fetch path, where Gmail's
   * search query syntax doesn't apply — messages surfaced by history.list
   * need to be tested against the same keyword list locally instead.
   * Mirrors the POC's implicit "does this text contain a bill keyword" check
   * that Gmail's search performed server-side for the full-scan path.
   */
  isCandidate(text: string): boolean {
    const haystack = text.toLowerCase();
    return BILL_KEYWORDS.some((kw) => haystack.includes(kw));
  }
}
