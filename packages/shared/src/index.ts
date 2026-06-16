/**
 * @nexuspay/shared
 *
 * Shared utilities, types, middleware, and infrastructure clients
 * used across all NexusPay microservices.
 */

// Config
export { ConfigLoader } from './config/ConfigLoader';

// Context
export { RequestContext } from './context/RequestContext';
export type { RequestContextData } from './context/RequestContext';

// Errors
export {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  InternalError,
} from './errors/AppError';

// Events
export { EventType } from './events/DomainEvent';
export type {
  DomainEvent,
  EventMetadata,
  OrderCreatedPayload,
  OrderConfirmedPayload,
  OrderCancelledPayload,
  InventoryReservedPayload,
  InventoryFailedPayload,
  PaymentCompletedPayload,
  PaymentFailedPayload,
} from './events/DomainEvent';

// Domain
export { Money } from './domain/Money';

// Resilience
export { retry } from './resilience/retry';
export type { RetryOptions, RetryAttemptInfo } from './resilience/retry';

// Observability
export { createLogger, childLogger } from './observability/logger';
export type { Logger, LogContext } from './observability/logger';

// Middleware
export { requestIdMiddleware } from './middleware/requestId';
export { requestLoggerMiddleware } from './middleware/requestLogger';
export { errorHandlerMiddleware } from './middleware/errorHandler';

// Health
export { HealthChecker } from './health/HealthChecker';
export type { HealthCheckResult, HealthStatus, DependencyCheck } from './health/HealthChecker';

// Messaging
export { RabbitMQConnection } from './messaging/RabbitMQConnection';
export { Publisher } from './messaging/Publisher';
export { Consumer } from './messaging/Consumer';
export type { EventHandler } from './messaging/Consumer';
export { setupTopology, Exchanges, Queues } from './messaging/topology';

// Cache
export { RedisClient } from './cache/RedisClient';