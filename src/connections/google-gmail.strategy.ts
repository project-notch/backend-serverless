import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import type { Request } from 'express';
import { OAuthStateService } from '../auth/oauth-state.service.js';
import { EmailConnectionService } from './email-connection.service.js';

const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // Google access tokens: always 1hr

/**
 * Connects a Gmail inbox to an already-logged-in account. Separate from
 * GoogleLoginStrategy on purpose — this is the only one that requests
 * gmail.readonly and offline access, and it's only reachable once already
 * authenticated (see GmailConnectStartGuard, which requires a valid JWT
 * before this strategy even runs).
 */
@Injectable()
export class GoogleGmailStrategy extends PassportStrategy(Strategy, 'google-gmail') {
  constructor(
    config: ConfigService,
    private readonly connectionService: EmailConnectionService,
    private readonly oauthStateService: OAuthStateService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_GMAIL_CALLBACK_URL'),
      scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
      passReqToCallback: true,
    });
  }

  override authorizationParams(): Record<string, string> {
    return { access_type: 'offline', prompt: 'consent' };
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    // The `state` query param round-trips through Google unmodified — it's
    // how we know which already-logged-in user this callback belongs to,
    // since the browser doesn't send an Authorization header on a redirect.
    const state = req.query.state as string;
    const userId = this.oauthStateService.verify(state);

    const connection = await this.connectionService.upsertConnection({
      userId,
      provider: 'google',
      providerAccountId: profile.id,
      emailAddress: profile.emails?.[0]?.value ?? '',
      accessToken,
      refreshToken,
      scope: 'profile email https://www.googleapis.com/auth/gmail.readonly',
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_LIFETIME_MS),
    });
    done(null, connection);
  }
}
