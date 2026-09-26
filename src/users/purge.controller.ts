import { Controller, ForbiddenException, Get, Headers, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { UserService } from './user.service.js';

/**
 * Hit by Vercel Cron (see vercel.json) once a day, never by users — purges
 * accounts whose 1-year "keep my bill data" retention window has passed.
 * Guarded by a shared secret rather than JwtAuthGuard since there's no user
 * session here at all, just the scheduler.
 */
@ApiExcludeController()
@Controller('internal')
export class PurgeController {
  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  @Get('purge-expired-accounts')
  async purgeExpiredAccounts(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret) throw new InternalServerErrorException('CRON_SECRET not configured');
    if (authorization !== `Bearer ${secret}`) throw new ForbiddenException();

    const purgedCount = await this.userService.purgeExpired();
    return { purgedCount };
  }
}
