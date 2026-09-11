import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'janedoe', description: 'Username or email' })
  @IsString()
  identifier!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}
