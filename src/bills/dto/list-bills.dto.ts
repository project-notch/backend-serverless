import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const BILL_FILTERS = ['upcoming', 'overdue', 'paid', 'all'] as const;
export type BillFilter = (typeof BILL_FILTERS)[number];

export const BILL_CATEGORIES = ['utility', 'telecom', 'subscription', 'insurance', 'other'] as const;
export type BillCategory = (typeof BILL_CATEGORIES)[number];

export const BILL_SORT_FIELDS = ['dueDate', 'amount', 'createdAt'] as const;
export type BillSortField = (typeof BILL_SORT_FIELDS)[number];

export class ListBillsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize: number = 10;

  @ApiPropertyOptional({ enum: BILL_FILTERS, default: 'upcoming' })
  @IsOptional()
  @IsIn(BILL_FILTERS)
  filter: BillFilter = 'upcoming';

  @ApiPropertyOptional({ enum: BILL_CATEGORIES })
  @IsOptional()
  @IsIn(BILL_CATEGORIES)
  category?: BillCategory;

  @ApiPropertyOptional({ enum: BILL_SORT_FIELDS, default: 'dueDate' })
  @IsOptional()
  @IsIn(BILL_SORT_FIELDS)
  sortBy: BillSortField = 'dueDate';
}
