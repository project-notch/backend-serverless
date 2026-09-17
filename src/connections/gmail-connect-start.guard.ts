import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OAuthStateService } from '../auth/oauth-state.service.js';

/**
 * Starts the Gmail-connect OAuth handshake, signing the already-authenticated
 * user's id into the `state` param so the callback (which arrives without an
 * Authorization header — it's a browser redirect from Google) knows which
 * account to attach the inbox to.
 *
 * Must run AFTER JwtAuthGuard in the route's guard list — it reads
 * `request.user`, which JwtAuthGuard is what populates.
 */
@Injectable()
export class GmailConnectStartGuard extends AuthGuard('google-gmail') {
  constructor(private readonly oauthStateService: OAuthStateService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.userId as string;
    const rawNickname = request.query.nickname;
    const nickname =
      typeof rawNickname === 'string' && rawNickname.trim()
        ? rawNickname.trim().slice(0, 60)
        : undefined;
    return { state: this.oauthStateService.sign(userId, nickname) };
  }
}
