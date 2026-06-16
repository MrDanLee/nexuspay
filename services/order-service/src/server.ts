import { createLogger } from '@nexuspay/shared';

import { app } from './app';
import { config } from './config';
import { closeDatabase } from './infrastructure/database/connection';
import { startMessaging, MessagingHandle } from './interfaces/messaging/startMessaging';

const logger = createLogger({ service: 'order-service' });
const SERVICE_NAME = 'order-service';

let messaging: MessagingHandle | null = null;

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, `${SERVICE_NAME} running`);

  // Start messaging out-of-band; the HTTP service stays up even if the
  // broker is temporarily unavailable (the outbox retries publishing).
  startMessaging()
    .then((handle) => {
      messaging = handle;
    })
    .catch((error) => {
      logger.error({ err: error }, 'Failed to start messaging; will rely on next restart');
    });
});

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Starting graceful shutdown...');

  if (messaging) {
    try {
      await messaging.stop();
      logger.info('Messaging stopped');
    } catch (error) {
      logger.error({ err: error }, 'Error stopping messaging');
    }
  }

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await closeDatabase();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error({ err: error }, 'Error closing database connection');
    }

    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});

export { server };
