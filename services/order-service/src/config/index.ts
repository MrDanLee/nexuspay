import { ConfigLoader } from '@nexuspay/shared';
import { z } from 'zod';


const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.string().default('development'),

  // Database
  ORDER_DB_URL: z.string().default('postgres://nexuspay:nexuspay_dev@localhost:5433/nexuspay_orders'),

  // RabbitMQ
  RABBITMQ_URL: z.string().default('amqp://nexuspay:nexuspay_dev@localhost:5672'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().default('nexuspay-dev-secret-change-in-production-min-32-chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Logging
  LOG_LEVEL: z.string().default('debug'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = ConfigLoader.load(configSchema);