import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service.js';

interface JwtPayload {
  sub: string;
  email: string;
  tokenVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Query-param fallback is for /connections/google: a full-page browser
      // redirect into Google's OAuth consent screen, which can't carry an
      // Authorization header. Same tradeoff the magic-link/OAuth callbacks
      // already make elsewhere in this codebase (token in the URL).
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * A signed, unexpired JWT alone used to be enough — a deleted account's
   * token, or one issued before a forced logout, stayed valid for the rest
   * of its 7-day life. This re-checks the DB on every request: the user row
   * must still exist (a fully-deleted account's token dies immediately, not
   * in up to 7 days) and its tokenVersion must match the one baked into this
   * token (see UserService.logoutAllDevices — bumping it invalidates every
   * previously issued token instantly, without a revocable-token table).
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email };
  }
}
