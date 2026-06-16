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
import { KnexPaymentRepository } from './infrastructure/repositories/KnexPaymentRepository';
import { KnexRefundRepository } from './infrastructure/repositories/KnexRefundRepository';
import { PaymentGatewayClient } from './infrastructure/external/PaymentGatewayClient';
import { CircuitBreaker } from './infrastructure/resilience/CircuitBreaker';
import { PaymentMetrics } from './infrastructure/observability/PaymentMetrics';
import { GatewayError } from './infrastructure/external/PaymentGatewayClient';
import { ProcessPaymentHandler } from './application/handlers/ProcessPaymentHandler';
import { RefundHandler } from './application/handlers/RefundHandler';
import { ProcessWebhookHandler } from './application/handlers/ProcessWebhookHandler';
import { GetPaymentHandler } from './application/queries/GetPaymentQuery';
import { PaymentController } from './interfaces/http/controllers/PaymentController';
import { WebhookController } from './interfaces/http/controllers/WebhookController';
import { registerRoutes } from './interfaces/http/routes';
import { createWebhookRoutes } from './interfaces/http/routes/webhookRoutes';

// ─── Logger ─────────────────────────────────────
const logger = createLogger({ service: 'payment-service' });

// ─── Dependencies ───────────────────────────────
const db = getDatabase();
const paymentRepository = new KnexPaymentRepository(db);
const refundRepository = new KnexRefundRepository(db);

const metrics = new PaymentMetrics();

const gateway = new PaymentGatewayClient({
  failureRate: config.GATEWAY_FAILURE_RATE,
  minLatencyMs: config.GATEWAY_MIN_LATENCY_MS,
  maxLatencyMs: config.GATEWAY_MAX_LATENCY_MS,
});

const circuitBreaker = new CircuitBreaker({
  failureThreshold: config.CIRCUIT_BREAKER_THRESHOLD,
  resetTimeoutMs: config.CIRCUIT_BREAKER_TIMEOUT_MS,
  // Only transient gateway failures should trip the breaker.
  shouldCount: (error) => error instanceof GatewayError && error.retryable,
  onStateChange: ({ from, to }) => {
    metrics.setCircuitState(to);
    logger.warn({ from, to }, 'Payment gateway circuit breaker state changed');
  },
});

// ─── Application Handlers ───────────────────────
const retryConfig = {
  maxAttempts: config.RETRY_MAX_ATTEMPTS,
  baseDelayMs: config.RETRY_BASE_DELAY_MS,
};
const processPaymentHandler = new ProcessPaymentHandler(
  paymentRepository,
  gateway,
  circuitBreaker,
  retryConfig,
  metrics,
);
const refundHandler = new RefundHandler(paymentRepository, refundRepository, gateway, retryConfig);
const getPaymentHandler = new GetPaymentHandler(paymentRepository);
const processWebhookHandler = new ProcessWebhookHandler(paymentRepository);

// ─── Controllers ────────────────────────────────
const paymentController = new PaymentController(
  processPaymentHandler,
  refundHandler,
  getPaymentHandler,
);
const webhookController = new WebhookController(processWebhookHandler, config.WEBHOOK_SECRET);

// ─── Health Checker ─────────────────────────────
const healthChecker = new HealthChecker();
healthChecker.register('database', checkDatabaseHealth);

// ─── Express App ────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(requestIdMiddleware());
app.use(requestLoggerMiddleware(logger));

// Webhooks must be mounted before the JSON parser (raw body for HMAC).
app.use('/webhooks', createWebhookRoutes(webhookController));

app.use(express.json({ limit: '10kb' }));

// Health checks
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', service: 'payment-service' });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const result = await healthChecker.check();
  const statusCode = result.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

// Metrics (Prometheus text format)
app.get('/metrics', (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; version=0.0.4').send(metrics.renderPrometheus());
});

// API routes
app.use(registerRoutes(paymentController));

// Error handler (must be last)
app.use(errorHandlerMiddleware(logger));

export { app };
