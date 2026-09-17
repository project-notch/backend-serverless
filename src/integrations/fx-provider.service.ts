import { Injectable, Logger } from '@nestjs/common';

/**
 * Thin wrapper around Frankfurter (https://frankfurter.dev) — a free,
 * no-API-key-required FX rate API backed by the ECB's daily reference
 * rates. Chosen per the plan: $0, no key to provision, good enough for
 * MVP-scale bill currency conversion.
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

    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        this.logger.warn(`Frankfurter FX lookup failed (${resp.status}) for ${base}->${quote}`);
        return null;
      }
      const data = (await resp.json()) as { rates?: Record<string, number> };
      return data.rates?.[quote.toUpperCase()] ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Frankfurter FX lookup errored for ${base}->${quote}: ${message}`);
      return null;
    }
  }
}
