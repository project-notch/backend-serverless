import { Body, Controller, Delete, Get, Param, Patch, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EmailConnectionService } from './email-connection.service.js';
import { GmailConnectStartGuard } from './gmail-connect-start.guard.js';
import { UpdateConnectionDto } from './dto/update-connection.dto.js';

@ApiTags('connections')
@Controller('connections')
export class ConnectionController {
  constructor(
    private readonly connectionService: EmailConnectionService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List this user's connected Gmail inboxes" })
  list(@Req() req: Request) {
    const user = req.user as { userId: string };
    return this.connectionService.listForUser(user.userId);
  }

  @Get('google')
  @UseGuards(JwtAuthGuard, GmailConnectStartGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start connecting a Gmail inbox (requires login first)',
    description:
      'Redirects to Google\'s consent screen requesting gmail.readonly. Not testable via "Try it out" — open this URL directly in a browser tab, with a valid JWT already in the session, instead.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Google consent screen' })
  connectGoogle() {
    // Guards handle everything: JwtAuthGuard populates req.user,
    // GmailConnectStartGuard signs it into `state` and redirects to Google.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google-gmail'))
  @ApiOperation({ summary: 'Gmail-connect callback (Google redirects here, not called directly)' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend connections page' })
  googleCallback(@Res() res: Response) {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    res.redirect(`${frontendUrl}/settings/connections?connected=1`);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Rename a connected inbox (its nickname)" })
  rename(@Param('id') id: string, @Body() dto: UpdateConnectionDto, @Req() req: Request) {
    const user = req.user as { userId: string };
    return this.connectionService.rename(user.userId, id, dto.displayName ?? '');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect a Gmail inbox' })
  disconnect(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as { userId: string };
    return this.connectionService.disconnect(user.userId, id);
  }
}
