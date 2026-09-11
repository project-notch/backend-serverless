import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account with email + username + password' })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return { token: this.authService.signAccessToken(user) };
  }

  @Post('login')
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Log in with username-or-email + password' })
  login(@Body() _dto: LoginDto, @Req() req: Request) {
    const user = req.user as { id: string; email: string };
    return { token: this.authService.signAccessToken(user) };
  }

  @Get('google')
  @UseGuards(AuthGuard('google-login'))
  @ApiOperation({
    summary: 'Start Google SSO login (identity only, no Gmail access)',
    description:
      'Redirects to Google\'s consent screen. Not testable via "Try it out" — open this URL directly in a browser tab instead.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Google consent screen' })
  googleLogin() {
    // Guard redirects to Google's consent screen; nothing to do here.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google-login'))
  @ApiOperation({ summary: 'Google SSO callback (Google redirects here, not called directly)' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with JWT in query string' })
  googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as { id: string; email: string };
    const token = this.authService.signAccessToken(user);
    res.redirect(this.authService.buildFrontendRedirectUrl(token));
  }
}
