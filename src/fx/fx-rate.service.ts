import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FxProviderService } from '../integrations/fx-provider.service.js';

function todayUtcDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class FxRateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxProvider: FxProviderService,
  ) {}

  /**
   * Rate for 1 unit of `base` in `quote`, cached per calendar day in
   * `fx_rates` so repeated bill conversions on the same day don't each hit
   * Frankfurter.
   */
  async getRate(base: string, quote: string): Promise<number | null> {
    const baseCurrency = base.toUpperCase();
    const quoteCurrency = quote.toUpperCase();
    if (baseCurrency === quoteCurrency) return 1;

    const asOfDate = todayUtcDateOnly();
    const cached = await this.prisma.fxRate.findUnique({
      where: { baseCurrency_quoteCurrency_asOfDate: { baseCurrency, quoteCurrency, asOfDate } },
    });
    if (cached) return Number(cached.rate);

    const rate = await this.fxProvider.getLatestRate(baseCurrency, quoteCurrency);
    if (rate === null) return null;

    await this.prisma.fxRate.upsert({
      where: { baseCurrency_quoteCurrency_asOfDate: { baseCurrency, quoteCurrency, asOfDate } },
      update: { rate },
      create: { baseCurrency, quoteCurrency, rate, asOfDate },
    });
    return rate;
  }

  async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<{ convertedAmount: number; rate: number } | null> {
    const rate = await this.getRate(from, to);
    if (rate === null) return null;
    return { convertedAmount: amount * rate, rate };
  }
}
