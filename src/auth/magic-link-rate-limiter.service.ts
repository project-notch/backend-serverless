import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const COOLDOWN_MS = 60_000;

/**
 * In-memory per-email cooldown for magic-link requests — no DB table, same
 * MVP tradeoff MagicLinkService already carries (resets on restart). Only
 * meant to stop accidental double-submits and cheap email-bombing of one
 * inbox, not to be a hard abuse defense.
 */
@Injectable()
export class MagicLinkRateLimiterService {
  private readonly lastSentAt = new Map<string, number>();

  check(email: string): void {
    const key = email.trim().toLowerCase();
    const now = Date.now();
    const last = this.lastSentAt.get(key);
    if (last && now - last < COOLDOWN_MS) {
      const waitSeconds = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      throw new HttpException(
        `Please wait ${waitSeconds}s before requesting another sign-in link.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastSentAt.set(key, now);
  }
}
