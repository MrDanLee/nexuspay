import express, { Request, Response } from 'express';
import pino from 'pino';
import supertest from 'supertest';

import {
  rateLimiterMiddleware,
  RateLimiterStore,
  RateLimitResult,
} from '../../../src/middleware/rateLimiter';
import { errorHandlerMiddleware } from '../../../src/middleware/errorHandler';
import { requestIdMiddleware } from '../../../src/middleware/requestId';

const logger = pino({ level: 'silent' });

class InMemoryStore implements RateLimiterStore {
  private readonly hits = new Map<string, number[]>();
  async hit(key: string, windowMs: number, limit: number, now: number): Promise<RateLimitResult> {
    const arr = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    arr.push(now);
    this.hits.set(key, arr);
    return {
      allowed: arr.length <= limit,
      remaining: Math.max(0, limit - arr.length),
      resetMs: windowMs,
    };
  }
}

let clock = 1000;

function createApp(store: RateLimiterStore, max: number, windowMs = 1000) {
  const app = express();
  app.use(requestIdMiddleware());
  app.use(
    rateLimiterMiddleware(store, {
      windowMs,
      max,
      now: () => clock,
      keyGenerator: (req: Request) => (req.headers['x-client'] as string) ?? 'default',
    }),
  );
  app.get('/', (_req: Request, res: Response) => res.json({ ok: true }));
  app.use(errorHandlerMiddleware(logger));
  return app;
}

describe('rateLimiterMiddleware', () => {
  beforeEach(() => {
    clock = 1000;
  });

  it('allows requests under the limit', async () => {
    const app = createApp(new InMemoryStore(), 3);

    for (let i = 0; i < 3; i += 1) {
      const res = await supertest(app).get('/');
      expect(res.status).toBe(200);
    }
  });

  it('rejects requests over the limit with 429 and Retry-After', async () => {
    const app = createApp(new InMemoryStore(), 2);

    await supertest(app).get('/');
    await supertest(app).get('/');
    const res = await supertest(app).get('/');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('slides the window over time', async () => {
    const app = createApp(new InMemoryStore(), 2, 1000);

    await supertest(app).get('/');
    await supertest(app).get('/');
    expect((await supertest(app).get('/')).status).toBe(429);

    clock += 1001; // window has passed
    expect((await supertest(app).get('/')).status).toBe(200);
  });

  it('tracks clients independently', async () => {
    const app = createApp(new InMemoryStore(), 1);

    expect((await supertest(app).get('/').set('x-client', 'a')).status).toBe(200);
    expect((await supertest(app).get('/').set('x-client', 'a')).status).toBe(429);
    // A different client still has its own budget.
    expect((await supertest(app).get('/').set('x-client', 'b')).status).toBe(200);
  });
});
