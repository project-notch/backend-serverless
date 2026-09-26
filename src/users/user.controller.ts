import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { UserService } from './user.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { ResolvePendingDeletionDto } from './dto/resolve-pending-deletion.dto.js';

function toProfile(user: User) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    phone: user.phone,
    defaultCurrency: user.defaultCurrency,
    timezone: user.timezone,
    hasPassword: Boolean(user.passwordHash),
    usernameSetByUser: user.usernameSetByUser,
    // 'pending_deletion': logged back in during the 1-year retention
    // window — the client must show the keep-data/start-new choice
    // (POST /users/me/resolve-pending-deletion) before continuing on.
    status: user.status,
  };
}

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the logged-in user's profile" })
  async me(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    return toProfile(user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update the logged-in user's profile (username, phone, currency, timezone)",
  })
  async updateMe(@Body() dto: UpdateUserDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return toProfile(await this.userService.updateProfile(userId, dto));
  }

  @Delete('me')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Permanently deletes the logged-in user's account and all their data. Requires the account password when one is set.",
  })
  async deleteMe(@Body() dto: DeleteAccountDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const { purgeAt } = await this.userService.remove(userId, {
      password: dto.password,
      keepBillData: dto.keepBillData,
    });
    return { deleted: true, dataRetainedUntil: purgeAt?.toISOString() ?? null };
  }

  @Post('me/resolve-pending-deletion')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Resolves a pending-deletion account the user just logged back into: keepData true restores their old bills/billers/connections, false wipes them and starts clean.',
  })
  async resolvePendingDeletion(@Body() dto: ResolvePendingDeletionDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    await this.userService.resolvePendingDeletion(userId, dto.keepData);
    return toProfile((await this.userService.findById(userId))!);
  }

  @Post('me/logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Invalidates every access token issued so far, on every device — including the one used to call this. Sign in again to get a new one.',
  })
  async logoutAllDevices(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    await this.userService.logoutAllDevices(userId);
    return { message: 'Logged out everywhere.' };
  }
}
