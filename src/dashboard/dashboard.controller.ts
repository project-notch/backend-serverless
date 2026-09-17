import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DashboardService } from './dashboard.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the logged-in user's dashboard stats" })
  summary(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.dashboardService.getSummary(userId);
  }
}
