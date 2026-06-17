import {
  securityHeaders,
  sanitizeMiddleware,
  createLogger,
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandlerMiddleware,
  idempotencyMiddleware,
  rateLimiterMiddleware,
  RedisSlidingWindowStore,
  authMiddleware,
  httpMetricsMiddleware,
  defaultRegistry,
  MetricsRegistry,
  HealthChecker,
  RedisClient,
} from '@nexuspay/shared';
import compression from 'compression';
import express, { Request, Response } from 'express';

import { CancelOrderHandler } from './application/handlers/CancelOrderHandler';
import { CreateOrderHandler } from './application/handlers/CreateOrderHandler';
import { GetOrderHandler } from './application/queries/GetOrderQuery';
import { GetTimelineHandler } from './application/queries/GetTimelineQuery';
import { ListOrdersHandler } from './application/queries/ListOrdersQuery';
import { config } from './config';
import { getDatabase, checkDatabaseHealth } from './infrastructure/database/connection';
import { KnexOrderRepository } from './infrastructure/repositories/KnexOrderRepository';
import { KnexSagaStepRepository } from './infrastructure/repositories/KnexSagaStepRepository';
import { OrderController } from './interfaces/http/controllers/OrderController';
import { registerRoutes } from './interfaces/http/routes';

// ─── Logger ─────────────────────────────────────
const logger = createLogger({ service: 'order-service' });

// ─── Dependencies ───────────────────────────────
const db = getDatabase();
const orderRepository = new KnexOrderRepository(db);
const redis = new RedisClient(config.REDIS_URL, logger);
const idempotency = idempotencyMiddleware(redis);
const rateLimiter = rateLimiterMiddleware(new RedisSlidingWindowStore(redis.getClient()), {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  keyGenerator: (req) =>
    (req as Request & { userId?: string }).userId ?? req.ip ?? 'anonymous',
});

// ─── Application Handlers ───────────────────────
const createOrderHandler = new CreateOrderHandler(orderRepository);
const cancelOrderHandler = new CancelOrderHandler(orderRepository);
const getOrderHandler = new GetOrderHandler(orderRepository);
const listOrdersHandler = new ListOrdersHandler(orderRepository);
const sagaStepRepository = new KnexSagaStepRepository(db);
const getTimelineHandler = new GetTimelineHandler(orderRepository, sagaStepRepository);

// ─── Controller ─────────────────────────────────
const orderController = new OrderController(
  createOrderHandler,
  cancelOrderHandler,
  getOrderHandler,
  listOrdersHandler,
  getTimelineHandler,
);

// ─── Health Checker ─────────────────────────────
const healthChecker = new HealthChecker();
healthChecker.register('database', checkDatabaseHealth);

// ─── Express App ────────────────────────────────
const app = express();

// Global middleware
app.use(securityHeaders());
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(sanitizeMiddleware());
app.use(requestIdMiddleware());
app.use(requestLoggerMiddleware(logger));
app.use(httpMetricsMiddleware());

// Health checks
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', service: 'order-service' });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const result = await healthChecker.check();
  const statusCode = result.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

// Prometheus scrape endpoint (text exposition format)
app.get('/metrics', (_req: Request, res: Response) => {
  res.set('Content-Type', MetricsRegistry.CONTENT_TYPE).send(defaultRegistry.render());
});

// Authenticate the public API, then rate limit (so limits are per-user).
app.use('/api/v1', authMiddleware({ secret: config.JWT_SECRET }));
app.use('/api/v1', rateLimiter);

// API routes
app.use(registerRoutes(orderController, idempotency));

// Error handler (must be last)
app.use(errorHandlerMiddleware(logger));

export { app, orderRepository };