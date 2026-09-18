import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateBillerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  name!: string;
}
