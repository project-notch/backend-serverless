import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CompleteSetupDto {
  @ApiPropertyOptional({
    example: 'janedoe',
    description: '3-30 chars, letters/numbers/underscore only. Leave unset to keep the auto-generated one.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    message: 'Username must be 3-30 characters: letters, numbers, underscore only',
  })
  username?: string;

  @ApiProperty({ example: 'a-strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
