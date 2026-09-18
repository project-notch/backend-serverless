import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserBillerService } from './user-biller.service.js';
import { CreateBillerDto } from './dto/create-biller.dto.js';
import { UpdateBillerDto } from './dto/update-biller.dto.js';
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

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually add a biller, seeding search keyword variants for future sync matching' })
  create(@Body() dto: CreateBillerDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.userBillerService.createManual(userId, dto.name);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List available bill categories' })
  categories() {
    return { categories: BILL_CATEGORIES };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a user's biller (rename and/or set active/inactive)" })
  update(@Param('id') id: string, @Body() dto: UpdateBillerDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.userBillerService.update(userId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a user's biller",
    description: 'Pass deleteBills=true to also delete its bills; otherwise they stay, just lose the grouping.',
  })
  async remove(
    @Param('id') id: string,
    @Query('deleteBills') deleteBills: string | undefined,
    @Req() req: Request,
  ): Promise<void> {
    const { userId } = req.user as { userId: string };
    await this.userBillerService.remove(userId, id, deleteBills === 'true');
  }
}
