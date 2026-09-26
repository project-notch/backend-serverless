import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ResolvePendingDeletionDto {
  /** True: restore previous bills/billers/connections. False: wipe them and start clean. */
  @ApiProperty()
  @IsBoolean()
  keepData!: boolean;
}
