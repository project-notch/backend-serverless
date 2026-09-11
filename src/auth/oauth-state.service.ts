import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface StatePayload {
  purpose: 'connect-gmail';
  userId: string;
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

  sign(userId: string): string {
    return this.jwtService.sign(
      { purpose: 'connect-gmail', userId } satisfies StatePayload,
      { expiresIn: '5m' },
    );
  }

  verify(state: string): string {
    const payload = this.jwtService.verify<StatePayload>(state);
    if (payload.purpose !== 'connect-gmail') {
      throw new Error('Invalid OAuth state token');
    }
    return payload.userId;
  }
}
