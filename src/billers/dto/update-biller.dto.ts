import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateBillerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
