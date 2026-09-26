import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset-password email' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'a-new-strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
