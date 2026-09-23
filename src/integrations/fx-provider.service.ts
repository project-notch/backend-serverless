import { Injectable, Logger } from '@nestjs/common';

/**
 * Thin wrapper around ExchangeRate-API's free "open" endpoint
 * (https://www.exchangerate-api.com/docs/free) — free, no API key, daily
 * rates. Replaced Frankfurter (ECB reference rates) 2026-09 because
 * Frankfurter only covers ~30 major currencies and doesn't include LKR,
 * which this app's users actually need (see `CURRENCY_ALIASES` in
 * `sync/currency-normalizer.service.ts` — "Rs"/"LKR" was already a
 * first-class case on the extraction side before the FX side could convert
 * it). This endpoint covers ~160 currencies, LKR included.
 */
@Injectable()
export class FxProviderService {
  private readonly logger = new Logger(FxProviderService.name);

  /**
   * Latest available rate for 1 unit of `base` expressed in `quote`.
   * Returns null (rather than throwing) on any failure — FX conversion is a
   * nice-to-have on top of the extracted bill, not something that should
   * fail the whole extraction.
   */
  async getLatestRate(base: string, quote: string): Promise<number | null> {
    if (base.toUpperCase() === quote.toUpperCase()) return 1;

    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base.toUpperCase())}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        this.logger.warn(`FX lookup failed (${resp.status}) for ${base}->${quote}`);
        return null;
      }
      const data = (await resp.json()) as { result?: string; rates?: Record<string, number> };
      if (data.result !== 'success') {
        this.logger.warn(`FX lookup returned non-success result for ${base}->${quote}: ${data.result}`);
        return null;
      }
      return data.rates?.[quote.toUpperCase()] ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`FX lookup errored for ${base}->${quote}: ${message}`);
      return null;
    }
  }
}
