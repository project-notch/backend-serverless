import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserService } from './user.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the logged-in user\'s profile' })
  async me(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      hasPassword: Boolean(user.passwordHash),
      usernameSetByUser: user.usernameSetByUser,
    };
  }
}
