import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
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
}
