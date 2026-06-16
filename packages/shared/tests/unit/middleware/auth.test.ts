import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import supertest from 'supertest';

import {
  authMiddleware,
  requireRole,
  AuthenticatedRequest,
} from '../../../src/middleware/auth';
import { errorHandlerMiddleware } from '../../../src/middleware/errorHandler';
import { requestIdMiddleware } from '../../../src/middleware/requestId';

const SECRET = 'test-secret';
const logger = pino({ level: 'silent' });

const sign = (payload: object, options: jwt.SignOptions = {}) =>
  jwt.sign(payload, SECRET, options);

function createApp(optional = false, role?: string) {
  const app = express();
  app.use(requestIdMiddleware());
  app.use(authMiddleware({ secret: SECRET, optional }));
  const guards = role ? [requireRole(role)] : [];
  app.get('/me', ...guards, (req: Request, res: Response) => {
    res.json({ user: (req as AuthenticatedRequest).user ?? null });
  });
  app.use(errorHandlerMiddleware(logger));
  return app;
}

describe('authMiddleware', () => {
  it('accepts a valid token and attaches the user', async () => {
    const app = createApp();
    const token = sign({ sub: 'user-1', roles: ['customer'] }, { expiresIn: '1h' });

    const res = await supertest(app).get('/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ userId: 'user-1', roles: ['customer'] });
  });

  it('rejects an expired token with 401', async () => {
    const app = createApp();
    const token = sign({ sub: 'user-1' }, { expiresIn: '-1s' });

    const res = await supertest(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token with 401', async () => {
    const app = createApp();
    const res = await supertest(app).get('/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a missing token on a protected route with 401', async () => {
    const app = createApp();
    const res = await supertest(app).get('/me');
    expect(res.status).toBe(401);
  });

  it('allows a missing token when auth is optional', async () => {
    const app = createApp(true);
    const res = await supertest(app).get('/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  describe('requireRole', () => {
    it('allows a user with the required role', async () => {
      const app = createApp(false, 'admin');
      const token = sign({ sub: 'admin-1', roles: ['admin'] }, { expiresIn: '1h' });

      const res = await supertest(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('forbids a user without the required role with 403', async () => {
      const app = createApp(false, 'admin');
      const token = sign({ sub: 'user-1', roles: ['customer'] }, { expiresIn: '1h' });

      const res = await supertest(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });
});
