import express, { Request, Response } from 'express';
import pino from 'pino';
import supertest from 'supertest';

import { errorHandlerMiddleware } from '../../../src/middleware/errorHandler';
import { idempotencyMiddleware, IdempotencyStore } from '../../../src/middleware/idempotency';
import { requestIdMiddleware } from '../../../src/middleware/requestId';

const logger = pino({ level: 'silent' });

class InMemoryStore implements IdempotencyStore {
  private readonly map = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.map.get(key) as T) ?? null;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }
}

function createApp(store: IdempotencyStore, opts = {}) {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware());

  let counter = 0;
  app.post('/orders', idempotencyMiddleware(store, opts), (_req: Request, res: Response) => {
    counter += 1;
    res.status(201).json({ counter });
  });

  let conflicts = 0;
  app.post('/conflict', idempotencyMiddleware(store, opts), (_req: Request, res: Response) => {
    conflicts += 1;
    res.status(409).json({ conflicts });
  });

  app.use(errorHandlerMiddleware(logger));
  return app;
}

describe('idempotencyMiddleware', () => {
  it('processes the first request normally', async () => {
    const app = createApp(new InMemoryStore());
    const res = await supertest(app).post('/orders').set('Idempotency-Key', 'k1');

    expect(res.status).toBe(201);
    expect(res.body.counter).toBe(1);
    expect(res.headers['idempotent-replay']).toBeUndefined();
  });

  it('returns the cached response on a duplicate key', async () => {
    const app = createApp(new InMemoryStore());

    const first = await supertest(app).post('/orders').set('Idempotency-Key', 'dup');
    const second = await supertest(app).post('/orders').set('Idempotency-Key', 'dup');

    expect(first.body.counter).toBe(1);
    expect(second.status).toBe(201);
    expect(second.body.counter).toBe(1); // handler did not run again
    expect(second.headers['idempotent-replay']).toBe('true');
  });

  it('processes different keys independently', async () => {
    const app = createApp(new InMemoryStore());

    const a = await supertest(app).post('/orders').set('Idempotency-Key', 'a');
    const b = await supertest(app).post('/orders').set('Idempotency-Key', 'b');

    expect(a.body.counter).toBe(1);
    expect(b.body.counter).toBe(2);
  });

  it('returns 400 when the key is required but missing', async () => {
    const app = createApp(new InMemoryStore(), { required: true });
    const res = await supertest(app).post('/orders');

    expect(res.status).toBe(400);
  });

  it('does not cache non-2xx responses', async () => {
    const app = createApp(new InMemoryStore());

    const first = await supertest(app).post('/conflict').set('Idempotency-Key', 'c1');
    const second = await supertest(app).post('/conflict').set('Idempotency-Key', 'c1');

    expect(first.body.conflicts).toBe(1);
    expect(second.body.conflicts).toBe(2); // re-processed, not cached
    expect(second.headers['idempotent-replay']).toBeUndefined();
  });
});
