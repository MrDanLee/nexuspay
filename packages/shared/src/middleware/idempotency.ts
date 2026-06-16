import { Request, Response, NextFunction } from 'express';

import { ValidationError } from '../errors/AppError';

/**
 * Minimal cache contract the middleware needs. The shared RedisClient
 * satisfies it, and tests can supply an in-memory implementation.
 */
export interface IdempotencyStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
}

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export interface IdempotencyOptions {
  /** How long to remember a response (seconds). Default 24h. */
  ttlSeconds?: number;
  /** Header carrying the key. Default 'idempotency-key'. */
  headerName?: string;
  /** Reject mutating requests without the header. Default false. */
  required?: boolean;
}

/**
 * Idempotency middleware backed by a cache (Redis in production).
 *
 * On a request carrying an Idempotency-Key it returns the previously
 * cached response for that key instead of processing again — critical for
 * payment operations where a network retry must not double-charge. The
 * response is cached (keyed by method + path + key) only when processing
 * succeeds with a 2xx status.
 */
export function idempotencyMiddleware(store: IdempotencyStore, options: IdempotencyOptions = {}) {
  const ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60;
  const headerName = (options.headerName ?? 'idempotency-key').toLowerCase();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.headers[headerName] as string | undefined;

    if (!key) {
      if (options.required) {
        next(new ValidationError(`${options.headerName ?? 'Idempotency-Key'} header is required`));
        return;
      }
      next();
      return;
    }

    const cacheKey = `idempotency:${req.method}:${req.originalUrl}:${key}`;

    try {
      const cached = await store.get<CachedResponse>(cacheKey);
      if (cached) {
        res.setHeader('Idempotent-Replay', 'true');
        res.status(cached.statusCode).json(cached.body);
        return;
      }
    } catch {
      // Cache unavailable: fail open and process the request normally.
      next();
      return;
    }

    // Capture the response body so a successful result can be cached.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void store.set(cacheKey, { statusCode: res.statusCode, body }, ttlSeconds);
      }
      return originalJson(body);
    };

    next();
  };
}
