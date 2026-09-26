import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { MagicLinkDto } from './dto/magic-link.dto.js';
import { CompleteSetupDto } from './dto/complete-setup.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { IpRateLimiterGuard } from './ip-rate-limiter.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(IpRateLimiterGuard)
  @ApiOperation({ summary: 'Create an account with email + username + password' })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return { token: this.authService.signAccessToken(user) };
  }

  @Post('login')
  // IpRateLimiterGuard first — a request over the limit is rejected before it
  // ever reaches the local strategy's password comparison.
  @UseGuards(IpRateLimiterGuard, AuthGuard('local'))
  @ApiOperation({
    summary:
      'Log in with username-or-email + password. A pending-deletion account is NOT auto-restored — ' +
      'check GET /users/me\'s status and, if pending_deletion, call POST /users/me/resolve-pending-deletion.',
  })
  login(@Body() _dto: LoginDto, @Req() req: Request) {
    const user = req.user as { id: string; email: string; tokenVersion: number };
    return { token: this.authService.signAccessToken(user) };
  }

  @Post('magic-link')
  @ApiOperation({ summary: 'Email a passwordless sign-in link (creates the account if new)' })
  async requestMagicLink(@Body() dto: MagicLinkDto) {
    await this.authService.requestMagicLink(dto.email);
    return { message: 'Check your email for a sign-in link.' };
  }

  @Get('magic/callback')
  @ApiOperation({ summary: 'Magic-link callback (opened from the emailed link, not called directly)' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with JWT in query string' })
  async magicLinkCallback(@Req() req: Request, @Res() res: Response) {
    const token = req.query.token as string;
    const user = await this.authService.verifyMagicLink(token);
    const accessToken = this.authService.signAccessToken(user);
    res.redirect(this.authService.buildFrontendRedirectUrl(accessToken));
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Email a password-reset link if the address is registered',
    description:
      'Always returns the same generic message, whether or not the email is registered — this cannot be used to check whether an account exists.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'If that email is registered, a reset link is on its way.' };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password using the token from a reset-password email' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password updated. Sign in with your new password.' };
  }

  @Get('reset-password/redirect')
  @ApiOperation({
    summary: 'Reset-password email link target (opened from the email, not called directly)',
    description:
      'An https link, not the nutine:// deep link — webmail clients like Gmail refuse to linkify a ' +
      'custom URI scheme in received HTML, so the emailed button points here and this redirects into the app.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to the app deep link' })
  resetPasswordRedirect(@Req() req: Request, @Res() res: Response) {
    const token = req.query.token as string;
    res.redirect(this.authService.buildResetPasswordDeepLink(token));
  }

  @Post('complete-setup')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Set a password (required) and optionally a username, for a passwordless account',
  })
  async completeSetup(@Body() dto: CompleteSetupDto, @Req() req: Request) {
    const user = req.user as { userId: string };
    await this.authService.completeSetup(user.userId, dto);
    return { message: 'Account setup complete.' };
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
    const user = req.user as { id: string; email: string; tokenVersion: number };
    const token = this.authService.signAccessToken(user);
    res.redirect(this.authService.buildFrontendRedirectUrl(token));
  }
}
