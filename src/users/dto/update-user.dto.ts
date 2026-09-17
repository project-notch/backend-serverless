import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'janedoe',
    description: '3-30 chars, letters/numbers/underscore only.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'Username must be 3-30 characters: letters, numbers, underscore only',
  })
  username?: string;

  @ApiPropertyOptional({
    example: '+14155552671',
    description: 'E.164-ish phone number. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^$|^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Enter a valid phone number',
  })
  phone?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'ISO 4217 currency code. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Z]{3}$/, { message: 'Use a 3-letter currency code, e.g. USD' })
  defaultCurrency?: string;

  @ApiPropertyOptional({
    example: 'America/New_York',
    description: 'IANA time zone name. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
