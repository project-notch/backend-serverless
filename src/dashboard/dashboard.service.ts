import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [totalDueThisMonth, overdue, upcoming7Days, totalBills, paidThisMonth, lastConnection] =
      await Promise.all([
        this.prisma.bill.aggregate({
          _sum: { amount: true },
          where: {
            userId,
            status: 'unpaid',
            dueDate: { gte: startOfMonth, lt: startOfNextMonth },
          },
        }),
        this.prisma.bill.aggregate({
          _sum: { amount: true },
          where: { userId, status: 'unpaid', dueDate: { lt: now } },
        }),
        this.prisma.bill.aggregate({
          _sum: { amount: true },
          where: { userId, status: 'unpaid', dueDate: { gte: now, lte: in7Days } },
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
      totalDueThisMonth: Number(totalDueThisMonth._sum.amount ?? 0),
      overdue: Number(overdue._sum.amount ?? 0),
      upcoming7Days: Number(upcoming7Days._sum.amount ?? 0),
      lastSyncedAt: lastConnection?.lastSyncedAt ?? null,
      totalBills,
      paidThisMonth,
    };
  }
}
