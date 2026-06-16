import { z } from 'zod';

import { ConfigLoader } from '@nexuspay/shared';

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3002),
  NODE_ENV: z.string().default('development'),

  // Database
  PAYMENT_DB_URL: z
    .string()
    .default('postgres://nexuspay:nexuspay_dev@localhost:5434/nexuspay_payments'),

  // RabbitMQ / Redis
  RABBITMQ_URL: z.string().default('amqp://nexuspay:nexuspay_dev@localhost:5672'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Simulated gateway behaviour
  GATEWAY_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  GATEWAY_MIN_LATENCY_MS: z.coerce.number().default(40),
  GATEWAY_MAX_LATENCY_MS: z.coerce.number().default(200),

  // Circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(5),
  CIRCUIT_BREAKER_TIMEOUT_MS: z.coerce.number().default(10000),

  // Retry
  RETRY_MAX_ATTEMPTS: z.coerce.number().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().default(100),

  // Webhook HMAC verification
  WEBHOOK_SECRET: z.string().default('whsec_nexuspay_dev_secret_change_me'),

  // Logging
  LOG_LEVEL: z.string().default('debug'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = ConfigLoader.load(configSchema);
