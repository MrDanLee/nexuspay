import { app } from './app';

const PORT = process.env.PORT ?? 3004;
const SERVICE_NAME = 'notification-service';

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] Server running on port ${PORT}`);
});

const shutdown = (signal: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    // eslint-disable-next-line no-console
    console.log(`[${SERVICE_NAME}] HTTP server closed`);
    process.exit(0);
  });

  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error(`[${SERVICE_NAME}] Forced shutdown after timeout`);
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[${SERVICE_NAME}] Unhandled rejection:`, reason);
  process.exit(1);
});

export { server };