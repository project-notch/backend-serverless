import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserBillerService } from './user-biller.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BILL_CATEGORIES } from '../bills/dto/list-bills.dto.js';

@ApiTags('billers')
@Controller('billers')
export class BillerController {
  constructor(private readonly userBillerService: UserBillerService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the logged-in user's billers" })
  list(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.userBillerService.listForUser(userId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List available bill categories' })
  categories() {
    return { categories: BILL_CATEGORIES };
  }
}
