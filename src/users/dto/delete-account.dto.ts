import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DeleteAccountDto {
  /** Required when the account has a password set (skipped for Google-only accounts). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  /** True: keep bill data for a year (cancelled by logging back in) instead of deleting it now. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  keepBillData?: boolean;
}
