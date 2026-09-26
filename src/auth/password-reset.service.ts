import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface PasswordResetPayload {
  purpose: 'password-reset';
  email: string;
}

/**
 * Signed short-lived JWT used as the reset token — same pattern as
 * MagicLinkService/OAuthStateService, same accepted tradeoff: no DB table,
 * so a link can be replayed until it expires (nothing marks it consumed).
 * Revisit once tokenVersion (see JwtStrategy) lands — baking the user's
 * tokenVersion into this payload at sign time would make a successful
 * reset (which should also bump tokenVersion to kill existing sessions)
 * invalidate the link itself as a side effect, for free.
 */
@Injectable()
export class PasswordResetService {
  constructor(private readonly jwtService: JwtService) {}

  sign(email: string): string {
    return this.jwtService.sign({ purpose: 'password-reset', email } satisfies PasswordResetPayload, {
      expiresIn: '15m',
    });
  }

  verify(token: string): string {
    let payload: PasswordResetPayload;
    try {
      payload = this.jwtService.verify<PasswordResetPayload>(token);
    } catch {
      throw new UnauthorizedException('This reset link is invalid or has expired.');
    }
    if (payload.purpose !== 'password-reset') {
      throw new UnauthorizedException('This reset link is invalid or has expired.');
    }
    return payload.email;
  }
}
