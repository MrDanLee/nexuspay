import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import {
  createLogger,
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandlerMiddleware,
  HealthChecker,
} from '@nexuspay/shared';

import { config } from './config';
import { getDatabase, checkDatabaseHealth } from './infrastructure/database/connection';
import { KnexInventoryRepository } from './infrastructure/repositories/KnexInventoryRepository';
import { ReserveStockHandler } from './application/handlers/ReserveStockHandler';
import { ReleaseStockHandler } from './application/handlers/ReleaseStockHandler';
import { CheckStockHandler } from './application/queries/CheckStockQuery';
import { InventoryController } from './interfaces/http/controllers/InventoryController';
import { registerRoutes } from './interfaces/http/routes';
import { ReservationExpiryJob } from './infrastructure/jobs/ReservationExpiryJob';

// ─── Logger ─────────────────────────────────────
const logger = createLogger({ service: 'inventory-service' });

// ─── Dependencies ───────────────────────────────
const db = getDatabase();
const inventoryRepository = new KnexInventoryRepository(db);

// ─── Application Handlers ───────────────────────
const reserveStockHandler = new ReserveStockHandler(inventoryRepository);
const releaseStockHandler = new ReleaseStockHandler(inventoryRepository);
const checkStockHandler = new CheckStockHandler(inventoryRepository);

// ─── Controller ─────────────────────────────────
const inventoryController = new InventoryController(
  reserveStockHandler,
  releaseStockHandler,
  checkStockHandler,
);

// ─── Background Jobs ────────────────────────────
const reservationExpiryJob = new ReservationExpiryJob(
  inventoryRepository,
  config.RESERVATION_SWEEP_INTERVAL_MS,
);

// ─── Health Checker ─────────────────────────────
const healthChecker = new HealthChecker();
healthChecker.register('database', checkDatabaseHealth);

// ─── Express App ────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(requestIdMiddleware());
app.use(requestLoggerMiddleware(logger));

// Health checks
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', service: 'inventory-service' });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const result = await healthChecker.check();
  const statusCode = result.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

// API routes
app.use(registerRoutes(inventoryController));

// Error handler (must be last)
app.use(errorHandlerMiddleware(logger));

export { app, reservationExpiryJob };
