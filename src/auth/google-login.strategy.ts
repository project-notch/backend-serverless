import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from './auth.service.js';

/**
 * "Sign in with Google" — identity only. Deliberately does NOT request
 * gmail.readonly or offline access; that's a separate, later flow
 * (GoogleGmailStrategy in connections/), only reachable once already
 * logged in. Keeping this one scoped to identity-only is a least-privilege
 * choice: creating an account should never require handing over inbox
 * access.
 */
@Injectable()
export class GoogleLoginStrategy extends PassportStrategy(Strategy, 'google-login') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['profile', 'email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    // passport-google-oauth20's typed Profile doesn't expose email_verified;
    // it's present on the raw userinfo payload Google returns.
    const rawProfile = profile._json as { email_verified?: boolean } | undefined;
    const user = await this.authService.validateGoogleLogin({
      googleId: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      emailVerified: rawProfile?.email_verified ?? false,
    });
    done(null, user);
  }
}
