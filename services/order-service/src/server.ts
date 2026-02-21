import { app } from './app';

const PORT = process.env.PORT ?? 3001;
const SERVICE_NAME = 'order-service';

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] Server running on port ${PORT}`);
});

// Graceful shutdown handler
const shutdown = (signal: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    // eslint-disable-next-line no-console
    console.log(`[${SERVICE_NAME}] HTTP server closed`);
    // Future: close DB connections, RabbitMQ channels, Redis client
    process.exit(0);
  });

  // Force shutdown after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error(`[${SERVICE_NAME}] Forced shutdown after timeout`);
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[${SERVICE_NAME}] Unhandled rejection:`, reason);
  // In production, this should trigger an alert, not a crash
  // But during development, crashing fast helps catch bugs
  process.exit(1);
});

export { server };