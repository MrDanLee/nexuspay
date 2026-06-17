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
import compression from 'compression';
import express, { Request, Response } from 'express';

import { AuditQueryHandler } from './application/queries/AuditQueryHandler';
import { config } from './config';
import { getDatabase, checkDatabaseHealth } from './infrastructure/database/connection';
import { KnexAuditRepository } from './infrastructure/repositories/KnexAuditRepository';
import { AuditController } from './interfaces/http/controllers/AuditController';
import { registerRoutes } from './interfaces/http/routes';

// ─── Logger ─────────────────────────────────────
const logger = createLogger({ service: 'audit-service' });

// ─── Dependencies ───────────────────────────────
const db = getDatabase();
const auditRepository = new KnexAuditRepository(db);
const auditQueryHandler = new AuditQueryHandler(auditRepository, {
  defaultLimit: config.QUERY_DEFAULT_LIMIT,
  maxLimit: config.QUERY_MAX_LIMIT,
});
const auditController = new AuditController(auditQueryHandler);

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

// API routes
app.use(registerRoutes(auditController));

// Error handler (must be last)
app.use(errorHandlerMiddleware(logger));

export { app, logger, auditRepository };
