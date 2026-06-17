import { ConfigLoader } from '@nexuspay/shared';
import { z } from 'zod';


const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3005),
  NODE_ENV: z.string().default('development'),

  // Database
  AUDIT_DB_URL: z
    .string()
    .default('postgres://nexuspay:nexuspay_dev@localhost:5436/nexuspay_audit'),

  // RabbitMQ
  RABBITMQ_URL: z.string().default('amqp://nexuspay:nexuspay_dev@localhost:5672'),

  // Default page size for audit queries.
  QUERY_DEFAULT_LIMIT: z.coerce.number().default(50),
  QUERY_MAX_LIMIT: z.coerce.number().default(200),

  // Logging
  LOG_LEVEL: z.string().default('debug'),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = ConfigLoader.load(configSchema);
