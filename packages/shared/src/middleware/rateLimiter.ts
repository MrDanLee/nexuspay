import { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';

import { RateLimitError } from '../errors/AppError';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the window frees up. */
  resetMs: number;
}

/**
 * Backing store for the sliding-window counter. Abstracted so the
 * middleware can be unit-tested with an in-memory implementation while
 * production uses Redis.
 */
export interface RateLimiterStore {
  hit(key: string, windowMs: number, limit: number, now: number): Promise<RateLimitResult>;
}

/**
 * Redis sliding-window store using a sorted set per key.
 *
 * Each request adds a timestamped member; stale members outside the window
 * are trimmed, then the cardinality is the current request count. The key
 * expires after the window so idle clients leave nothing behind.
 */
export class RedisSlidingWindowStore implements RateLimiterStore {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number, limit: number, now: number): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const member = `${now}-${Math.floor(Math.random() * 1e9)}`;

    const results = await this.redis
      .multi()
      .zremrangebyscore(redisKey, 0, now - windowMs)
      .zadd(redisKey, now, member)
      .zcard(redisKey)
      .pexpire(redisKey, windowMs)
      .exec();

    const count = Number(results?.[2]?.[1] ?? 0);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetMs: windowMs,
    };
  }
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** Derive the client key (default: req.ip). */
  keyGenerator?: (req: Request) => string;
  /** Clock injection for deterministic tests. */
  now?: () => number;
}

/**
 * Distributed rate limiter middleware (sliding window).
 *
 * Sets X-RateLimit-* headers, returns 429 with a Retry-After header when
 * the limit is exceeded, and fails open if the store is unavailable so a
 * Redis blip never takes the API down.
 */
export function rateLimiterMiddleware(store: RateLimiterStore, options: RateLimiterOptions) {
  const clock = options.now ?? Date.now;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = options.keyGenerator ? options.keyGenerator(req) : (req.ip ?? 'unknown');

    let result: RateLimitResult;
    try {
      result = await store.hit(key, options.windowMs, options.max, clock());
    } catch {
      next(); // fail open
      return;
    }

    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      const retryAfter = Math.ceil(result.resetMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      next(new RateLimitError('Too many requests', { retryAfter }));
      return;
    }

    next();
  };
}
