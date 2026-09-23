import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { daysFromTodayUtc, startOfMonthUtc, startOfNextMonthUtc, startOfTodayUtc } from '../common/user-timezone.util.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bills carry both `amount` (original currency) and `convertedAmount`
   * (only set when it differs from the user's default currency — see
   * BillExtractionService). Summing `amount` directly would silently mix
   * currencies once a user has bills in more than one; `convertedAmount ??
   * amount` is the correct per-bill figure to add up.
   */
  private sumBills(bills: { amount: Prisma.Decimal | null; convertedAmount: Prisma.Decimal | null }[]): number {
    return bills.reduce((total, bill) => {
      const value = bill.convertedAmount ?? bill.amount;
      return total + (value ? Number(value) : 0);
    }, 0);
  }

  async getSummary(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const timezone = user?.timezone;

    const today = startOfTodayUtc(timezone);
    const startOfMonth = startOfMonthUtc(timezone);
    const startOfNextMonth = startOfNextMonthUtc(timezone);
    const in7Days = daysFromTodayUtc(timezone, 7);

    const amountFields = { amount: true, convertedAmount: true } as const;

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

    return {
      totalDueThisMonth: this.sumBills(dueThisMonthBills),
      overdue: this.sumBills(overdueBills),
      upcoming7Days: this.sumBills(upcoming7DaysBills),
      lastSyncedAt: lastConnection?.lastSyncedAt ?? null,
      totalBills,
      paidThisMonth,
    };
  }
}
