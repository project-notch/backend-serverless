import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateConnectionDto {
  @ApiPropertyOptional({
    example: 'Personal',
    description: 'Inbox nickname. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayName?: string;
}
