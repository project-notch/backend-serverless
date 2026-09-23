import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { daysFromTodayUtc, startOfMonthUtc, startOfNextMonthUtc, startOfTodayUtc } from '../common/user-timezone.util.js';
import { FxRateService } from '../fx/fx-rate.service.js';

type BillAmount = { amount: Prisma.Decimal | null; currency: string | null };

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRateService: FxRateService,
  ) {}

  /**
   * Sums bills' amounts converted into `defaultCurrency`. Deliberately
   * recomputed here rather than trusting `Bill.convertedAmount` —
   * that column is filled once at sync time against whatever the user's
   * default currency was *then*; changing it afterward left every
   * already-synced bill showing stale numbers under the new currency's
   * symbol. `rates` is a pre-fetched currency->rate map so this stays a
   * synchronous reduce instead of one FX call per bill.
   */
  private sumBills(bills: BillAmount[], defaultCurrency: string | null, rates: Map<string, number | null>): number {
    return bills.reduce((total, bill) => {
      if (!bill.amount) return total;
      const amount = Number(bill.amount);
      if (!defaultCurrency || !bill.currency || bill.currency.toUpperCase() === defaultCurrency.toUpperCase()) {
        return total + amount;
      }
      const rate = rates.get(bill.currency.toUpperCase());
      // No rate available (lookup failed, or this currency pair was never
      // fetched) — fall back to the raw amount rather than dropping it, the
      // same "better than silently zeroing a bill" tradeoff the old
      // convertedAmount-or-amount fallback made.
      return total + (rate ?? 1) * amount;
    }, 0);
  }

  private async fetchRates(bills: BillAmount[], defaultCurrency: string | null): Promise<Map<string, number | null>> {
    const rates = new Map<string, number | null>();
    if (!defaultCurrency) return rates;

    const currencies = new Set(
      bills
        .map((b) => b.currency?.toUpperCase())
        .filter((c): c is string => !!c && c !== defaultCurrency.toUpperCase()),
    );
    await Promise.all(
      [...currencies].map(async (currency) => {
        rates.set(currency, await this.fxRateService.getRate(currency, defaultCurrency));
      }),
    );
    return rates;
  }

  async getSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, defaultCurrency: true },
    });
    const timezone = user?.timezone;
    const defaultCurrency = user?.defaultCurrency ?? null;

    const today = startOfTodayUtc(timezone);
    const startOfMonth = startOfMonthUtc(timezone);
    const startOfNextMonth = startOfNextMonthUtc(timezone);
    const in7Days = daysFromTodayUtc(timezone, 7);

    const amountFields = { amount: true, currency: true } as const;

    const [dueThisMonthBills, overdueBills, upcoming7DaysBills, totalBills, paidThisMonth, lastConnection] =
      await Promise.all([
        this.prisma.bill.findMany({
          select: amountFields,
          where: { userId, status: 'unpaid', dueDate: { gte: startOfMonth, lt: startOfNextMonth } },
        }),
        this.prisma.bill.findMany({
          select: amountFields,
          where: { userId, status: 'unpaid', dueDate: { lt: today } },
        }),
        this.prisma.bill.findMany({
          select: amountFields,
          where: { userId, status: 'unpaid', dueDate: { gte: today, lte: in7Days } },
        }),
        this.prisma.bill.count({ where: { userId } }),
        this.prisma.bill.count({
          where: { userId, status: 'paid', paidAt: { gte: startOfMonth, lt: startOfNextMonth } },
        }),
        this.prisma.emailConnection.findFirst({
          where: { userId },
          orderBy: { lastSyncedAt: 'desc' },
          select: { lastSyncedAt: true },
        }),
      ]);

    const rates = await this.fetchRates(
      [...dueThisMonthBills, ...overdueBills, ...upcoming7DaysBills],
      defaultCurrency,
    );

    return {
      totalDueThisMonth: this.sumBills(dueThisMonthBills, defaultCurrency, rates),
      overdue: this.sumBills(overdueBills, defaultCurrency, rates),
      upcoming7Days: this.sumBills(upcoming7DaysBills, defaultCurrency, rates),
      lastSyncedAt: lastConnection?.lastSyncedAt ?? null,
      totalBills,
      paidThisMonth,
    };
  }
}
