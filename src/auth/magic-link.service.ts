import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface MagicLinkPayload {
  purpose: 'magic-link';
  email: string;
}

/**
 * Signed short-lived JWT used as the magic-link token — same pattern as
 * OAuthStateService, deliberately: no DB table/migration, consistent with
 * this codebase's existing interim-token tradeoffs. Downside carried over
 * too: a link can be replayed until it expires, since nothing marks it
 * consumed. Acceptable for MVP; revisit alongside the refresh-token work.
 */
@Injectable()
export class MagicLinkService {
  constructor(private readonly jwtService: JwtService) {}

  sign(email: string): string {
    return this.jwtService.sign({ purpose: 'magic-link', email } satisfies MagicLinkPayload, {
      expiresIn: '15m',
    });
  }

  verify(token: string): string {
    let payload: MagicLinkPayload;
    try {
      payload = this.jwtService.verify<MagicLinkPayload>(token);
    } catch {
      throw new UnauthorizedException('This sign-in link is invalid or has expired.');
    }
    if (payload.purpose !== 'magic-link') {
      throw new UnauthorizedException('This sign-in link is invalid or has expired.');
    }
    return payload.email;
  }
}
