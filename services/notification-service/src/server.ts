import { app, logger, setMessagingReady } from './app';
import { config } from './config';
import { startMessaging, MessagingHandle } from './interfaces/messaging/startMessaging';

const SERVICE_NAME = 'notification-service';

let messaging: MessagingHandle | null = null;

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, `${SERVICE_NAME} running`);

  startMessaging()
    .then((handle) => {
      messaging = handle;
      setMessagingReady(true);
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
      setMessagingReady(false);
      logger.info('Messaging stopped');
    } catch (error) {
      logger.error({ err: error }, 'Error stopping messaging');
    }
  }

  server.close(() => {
    logger.info('HTTP server closed');
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
