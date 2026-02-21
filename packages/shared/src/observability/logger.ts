import pino, { Logger as PinoLogger } from 'pino';

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  service?: string;
  [key: string]: unknown;
}

/**
 * Structured JSON logger built on pino.
 *
 * All log entries are JSON objects with consistent fields,
 * making them searchable in log aggregation tools like
 * Elasticsearch, Datadog, or CloudWatch.
 *
 * Usage:
 *   const logger = createLogger({ service: 'order-service' });
 *   logger.info({ orderId: '123' }, 'Order created');
 *
 * Child loggers for request-scoped context:
 *   const reqLogger = logger.child({ requestId: 'abc', userId: 'user-1' });
 *   reqLogger.info('Processing request');
 *   // Output includes requestId and userId automatically
 */
export function createLogger(context: LogContext = {}): PinoLogger {
  const level = process.env.LOG_LEVEL ?? 'info';

  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    base: {
      ...context,
    },
    // Redact sensitive fields from logs
    redact: {
      paths: ['password', 'token', 'authorization', 'secret', 'creditCard'],
      censor: '[REDACTED]',
    },
  });
}

/**
 * Create a child logger with additional context.
 * Useful for adding request-scoped data like requestId, userId.
 */
export function childLogger(parent: PinoLogger, context: LogContext): PinoLogger {
  return parent.child(context);
}

export type { PinoLogger as Logger };