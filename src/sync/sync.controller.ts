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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger a Gmail inbox sync for one connected inbox ("Sync Now")',
    description: 'Runs the sync inline and waits for it to finish before responding.',
  })
  @ApiResponse({ status: 200, description: 'Sync finished' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 403, description: "Connection does not belong to the logged-in user" })
  async sync(@Param('connectionId') connectionId: string, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.syncService.startSync(userId, connectionId);
  }
}
