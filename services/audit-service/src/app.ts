import express, { Request, Response } from 'express';
import compression from 'compression';
import {
  securityHeaders,
  createLogger,
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandlerMiddleware,
  httpMetricsMiddleware,
  defaultRegistry,
  MetricsRegistry,
  HealthChecker,
} from '@nexuspay/shared';

import { getDatabase, checkDatabaseHealth } from './infrastructure/database/connection';
import { KnexAuditRepository } from './infrastructure/repositories/KnexAuditRepository';

// ─── Logger ─────────────────────────────────────
const logger = createLogger({ service: 'audit-service' });

// ─── Dependencies ───────────────────────────────
const db = getDatabase();
const auditRepository = new KnexAuditRepository(db);

// ─── Health Checker ─────────────────────────────
const healthChecker = new HealthChecker();
healthChecker.register('database', checkDatabaseHealth);

// ─── Express App ────────────────────────────────
const app = express();

app.use(securityHeaders());
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(requestIdMiddleware());
app.use(requestLoggerMiddleware(logger));
app.use(httpMetricsMiddleware());

// Health checks
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', service: 'audit-service' });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const result = await healthChecker.check();
  const statusCode = result.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

// Prometheus scrape endpoint
app.get('/metrics', (_req: Request, res: Response) => {
  res.set('Content-Type', MetricsRegistry.CONTENT_TYPE).send(defaultRegistry.render());
});

// Error handler (must be last)
app.use(errorHandlerMiddleware(logger));

export { app, logger, auditRepository };
