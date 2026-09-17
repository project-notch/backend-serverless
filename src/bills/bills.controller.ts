import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { BillService } from './bills.service.js';
import { ListBillsDto } from './dto/list-bills.dto.js';
import { UpdateBillDto } from './dto/update-bill.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@ApiTags('bills')
@Controller('bills')
export class BillController {
  constructor(private readonly billService: BillService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the logged-in user's bills (filtered, sorted, paginated)" })
  list(@Query() query: ListBillsDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.billService.list(userId, query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a bill paid or unpaid' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateBillDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.billService.updateStatus(userId, id, dto.status);
  }
}
