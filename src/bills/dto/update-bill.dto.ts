import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateBillDto {
  @ApiProperty({ enum: ['paid', 'unpaid'] })
  @IsIn(['paid', 'unpaid'])
  status!: 'paid' | 'unpaid';
}
