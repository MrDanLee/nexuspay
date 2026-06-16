import { createLogger } from '@nexuspay/shared';

import { app, reservationExpiryJob } from './app';
import { config } from './config';
import { closeDatabase } from './infrastructure/database/connection';

const logger = createLogger({ service: 'inventory-service' });
const SERVICE_NAME = 'inventory-service';

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, `${SERVICE_NAME} running`);
  reservationExpiryJob.start();
});

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Starting graceful shutdown...');

  reservationExpiryJob.stop();

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
