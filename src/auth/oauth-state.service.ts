import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface StatePayload {
  purpose: 'connect-gmail';
  userId: string;
  nickname?: string;
}

/**
 * The Gmail-connect OAuth roundtrip leaves the app and comes back, so the
 * logged-in user's identity has to survive it somehow. This signs that
 * identity into the OAuth `state` query param and verifies it on return.
 *
 * Must be signed — an unsigned/unverified state is a CSRF hole that would
 * let an attacker's crafted callback attach their own Gmail inbox to a
 * victim's account.
 */
@Injectable()
export class OAuthStateService {
  constructor(private readonly jwtService: JwtService) {}

  sign(userId: string, nickname?: string): string {
    return this.jwtService.sign(
      { purpose: 'connect-gmail', userId, nickname } satisfies StatePayload,
      { expiresIn: '5m' },
    );
  }

  verify(state: string): { userId: string; nickname?: string } {
    const payload = this.jwtService.verify<StatePayload>(state);
    if (payload.purpose !== 'connect-gmail') {
      throw new Error('Invalid OAuth state token');
    }
    return { userId: payload.userId, nickname: payload.nickname };
  }
}
