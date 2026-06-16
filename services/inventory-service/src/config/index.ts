import { z } from 'zod';

import { ConfigLoader } from '@nexuspay/shared';

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3003),
  NODE_ENV: z.string().default('development'),

  // Database
  INVENTORY_DB_URL: z
    .string()
    .default('postgres://nexuspay:nexuspay_dev@localhost:5435/nexuspay_inventory'),

  // RabbitMQ
  RABBITMQ_URL: z.string().default('amqp://nexuspay:nexuspay_dev@localhost:5672'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Reservation expiry
  RESERVATION_TTL_SECONDS: z.coerce.number().default(900),
  RESERVATION_SWEEP_INTERVAL_MS: z.coerce.number().default(60000),

  // Logging
  LOG_LEVEL: z.string().default('debug'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = ConfigLoader.load(configSchema);
