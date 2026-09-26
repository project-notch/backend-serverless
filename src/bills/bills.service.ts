import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Bill, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { daysFromTodayUtc, startOfTodayUtc } from '../common/user-timezone.util.js';
import { FxRateService } from '../fx/fx-rate.service.js';
import type { ListBillsDto } from './dto/list-bills.dto.js';

@Injectable()
export class BillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRateService: FxRateService,
  ) {}

  /**
   * `Bill.convertedAmount`/`convertedCurrency`/`fxRateUsed` are filled once
   * at sync time against whatever the user's default currency was *then* —
   * they go stale the moment the user changes it. Recomputed here against
   * the *current* default currency instead of trusting those columns;
   * `rates` is pre-fetched so this stays synchronous per bill.
   */
  private toResponse(bill: Bill, defaultCurrency: string | null, rates: Map<string, number | null>) {
    const amount = bill.amount ? Number(bill.amount) : null;
    let convertedAmount: number | null = null;
    let convertedCurrency: string | null = null;
    let fxRateUsed: number | null = null;

    if (amount !== null && defaultCurrency && bill.currency && bill.currency.toUpperCase() !== defaultCurrency.toUpperCase()) {
      const rate = rates.get(bill.currency.toUpperCase());
      if (rate !== null && rate !== undefined) {
        convertedAmount = amount * rate;
        convertedCurrency = defaultCurrency;
        fxRateUsed = rate;
      }
    }

    return {
      id: bill.id,
      userBillerId: bill.userBillerId,
      company: bill.extractedCompany,
      amount,
      currency: bill.currency,
      convertedAmount,
      convertedCurrency,
      fxRateUsed,
      dueDate: bill.dueDate,
      category: bill.category,
      status: bill.status,
      confidence: bill.confidence ? Number(bill.confidence) : null,
      createdAt: bill.createdAt,
    };
  }

  private async fetchRates(bills: Bill[], defaultCurrency: string | null): Promise<Map<string, number | null>> {
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

  async list(userId: string, query: ListBillsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, defaultCurrency: true },
    });
    const today = startOfTodayUtc(user?.timezone);
    const in30Days = daysFromTodayUtc(user?.timezone, 30);

    const where: Prisma.BillWhereInput = { userId };

    switch (query.filter) {
      case 'upcoming':
        where.status = 'unpaid';
        where.dueDate = { gte: today, lte: in30Days };
        break;
      case 'overdue':
        where.status = 'unpaid';
        where.dueDate = { lt: today };
        break;
      case 'paid':
        where.status = 'paid';
        break;
      case 'all':
      default:
        break;
    }

    if (query.category) {
      where.category = query.category;
    }

    const skip = (query.page - 1) * query.pageSize;

    const [bills, total] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        orderBy: { [query.sortBy]: 'asc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.bill.count({ where }),
    ]);

    const rates = await this.fetchRates(bills, user?.defaultCurrency ?? null);

    return {
      bills: bills.map((bill) => this.toResponse(bill, user?.defaultCurrency ?? null, rates)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async updateStatus(userId: string, billId: string, status: 'paid' | 'unpaid') {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.userId !== userId) throw new ForbiddenException();

    const updated = await this.prisma.bill.update({
      where: { id: billId },
      data: { status, paidAt: status === 'paid' ? new Date() : null },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { defaultCurrency: true } });
    const rates = await this.fetchRates([updated], user?.defaultCurrency ?? null);
    return this.toResponse(updated, user?.defaultCurrency ?? null, rates);
  }

  /**
   * Manual delete — the escape hatch for a bill the extraction pipeline got
   * wrong (duplicate, misclassified, whatever). Only removes the Bill row;
   * its source EmailCandidate stays `processed: true`, so a future sync
   * won't re-extract and resurrect it.
   */
  async remove(userId: string, billId: string): Promise<void> {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.userId !== userId) throw new ForbiddenException();

    await this.prisma.bill.delete({ where: { id: billId } });
  }
}
