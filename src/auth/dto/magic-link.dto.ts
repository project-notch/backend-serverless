import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class MagicLinkDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string;
}
