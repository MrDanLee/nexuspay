import { z } from 'zod';

import { ConfigLoader } from '@nexuspay/shared';

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3004),
  NODE_ENV: z.string().default('development'),

  // RabbitMQ
  RABBITMQ_URL: z.string().default('amqp://nexuspay:nexuspay_dev@localhost:5672'),

  // Redis — used for best-effort consume-once idempotency.
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // How long a processed event id is remembered for dedup (seconds).
  DEDUP_TTL_SECONDS: z.coerce.number().default(86400),

  // Logging
  LOG_LEVEL: z.string().default('debug'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = ConfigLoader.load(configSchema);
