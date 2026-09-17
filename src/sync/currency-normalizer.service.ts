import { Injectable } from '@nestjs/common';

/**
 * Ported verbatim from the Python POC
 * (`demo-runs/bill-detector-poc/src/stage2_extract.py`, `CURRENCY_ALIASES`).
 */
export const CURRENCY_ALIASES: Record<string, string> = {
  rs: 'LKR',
  'rs.': 'LKR',
  'sl rs': 'LKR',
  'sri lankan rupee': 'LKR',
  'sri lankan rupees': 'LKR',
  lkr: 'LKR',
  $: 'USD',
  'us$': 'USD',
  usd: 'USD',
};

@Injectable()
export class CurrencyNormalizerService {
  /**
   * Ported verbatim from the POC's `normalize_currency()`.
   */
  normalize(currency: string | null | undefined): string | null {
    if (currency === null || currency === undefined) return null;
    const trimmed = currency.trim();
    return CURRENCY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  }
}
