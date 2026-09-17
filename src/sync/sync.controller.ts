import { Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SyncService } from './sync.service.js';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post(':connectionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger a Gmail inbox sync for one connected inbox ("Sync Now")',
    description:
      'Submits an async pg-boss job and returns immediately. Poll GET /connections for status/lastSyncedAt to track progress.',
  })
  @ApiResponse({ status: 202, description: 'Sync job submitted' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 403, description: "Connection does not belong to the logged-in user" })
  async sync(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.syncService.startSync(userId, connectionId);
  }
}
