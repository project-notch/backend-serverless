import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListBillsDto } from './dto/list-bills.dto.js';

@Injectable()
export class BillService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListBillsDto) {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const where: Prisma.BillWhereInput = { userId };

    switch (query.filter) {
      case 'upcoming':
        where.status = 'unpaid';
        where.dueDate = { gte: now, lte: in30Days };
        break;
      case 'overdue':
        where.status = 'unpaid';
        where.dueDate = { lt: now };
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

    return {
      bills: bills.map((bill) => ({
        id: bill.id,
        company: bill.extractedCompany,
        amount: bill.amount ? Number(bill.amount) : null,
        currency: bill.currency,
        dueDate: bill.dueDate,
        category: bill.category,
        status: bill.status,
        confidence: bill.confidence ? Number(bill.confidence) : null,
        createdAt: bill.createdAt,
      })),
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

    return {
      id: updated.id,
      company: updated.extractedCompany,
      amount: updated.amount ? Number(updated.amount) : null,
      currency: updated.currency,
      dueDate: updated.dueDate,
      category: updated.category,
      status: updated.status,
      confidence: updated.confidence ? Number(updated.confidence) : null,
      createdAt: updated.createdAt,
    };
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
