import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

/**
 * Hand-rolled per-IP fixed-window limiter — replaces @nestjs/throttler,
 * whose CJS build crash-loops the whole app in this project's ESM setup
 * ("type": "module") once bundled by Vercel: `require() of ES Module
 * @nestjs/common/index.js ... not supported`, thrown from
 * throttler.decorator.js. No fix in that package as of writing, so this
 * mirrors MagicLinkRateLimiterService's already-proven in-memory pattern
 * instead of chasing a dependency's bundler compatibility.
 *
 * Same MVP tradeoff as that service: in-memory, resets on restart, and on
 * Vercel only tracks a single warm lambda instance, not a shared count
 * across every concurrent one. Stops the common case (one attacker
 * hammering from one connection during a warm instance's lifetime), not a
 * hard abuse defense.
 */
@Injectable()
export class IpRateLimiterGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip ?? 'unknown';
    const now = Date.now();

    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= WINDOW_MS) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= MAX_REQUESTS) {
      const waitSeconds = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
      throw new HttpException(
        `Too many requests. Try again in ${waitSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }
}
