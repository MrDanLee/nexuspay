import express, { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import supertest from 'supertest';

import { errorHandlerMiddleware } from '../../../src/middleware/errorHandler';
import { requestIdMiddleware } from '../../../src/middleware/requestId';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../../src/errors/AppError';

// Silent logger for tests
const logger = pino({ level: 'silent' });

function createApp(routeHandler: (req: Request, res: Response, next: NextFunction) => void) {
  const app = express();
  app.use(requestIdMiddleware());
  app.get('/test', routeHandler);
  app.use(errorHandlerMiddleware(logger));
  return app;
}

describe('errorHandlerMiddleware', () => {
  it('should return 404 for NotFoundError', async () => {
    const app = createApp((_req, _res, next) => {
      next(new NotFoundError('Order not found', { instance: '/api/v1/orders/123' }));
    });

    const response = await supertest(app).get('/test');

    expect(response.status).toBe(404);
    expect(response.body.type).toBe('https://nexuspay.dev/errors/not-found');
    expect(response.body.detail).toBe('Order not found');
    expect(response.body.instance).toBe('/api/v1/orders/123');
    expect(response.body.traceId).toBeDefined();
  });

  it('should return 400 for ValidationError with fields', async () => {
    const app = createApp((_req, _res, next) => {
      next(
        new ValidationError('Invalid input', {
          fields: { email: 'Invalid format' },
        }),
      );
    });

    const response = await supertest(app).get('/test');

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ email: 'Invalid format' });
  });

  it('should return 409 for ConflictError', async () => {
    const app = createApp((_req, _res, next) => {
      next(new ConflictError('Duplicate idempotency key'));
    });

    const response = await supertest(app).get('/test');

    expect(response.status).toBe(409);
    expect(response.body.title).toBe('Conflict');
  });

  it('should return 500 for unknown errors without leaking details', async () => {
    const app = createApp(() => {
      throw new Error('database connection refused at 10.0.0.5:5432');
    });

    const response = await supertest(app).get('/test');

    expect(response.status).toBe(500);
    expect(response.body.detail).toBe('An unexpected error occurred');
    expect(response.body.detail).not.toContain('10.0.0.5');
  });

  it('should include traceId in error response', async () => {
    const app = createApp((_req, _res, next) => {
      next(new NotFoundError('Not found'));
    });

    const response = await supertest(app)
      .get('/test')
      .set('X-Request-ID', 'custom-trace-123');

    expect(response.body.traceId).toBe('custom-trace-123');
  });
});