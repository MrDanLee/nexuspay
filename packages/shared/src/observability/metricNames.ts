/**
 * Single source of truth for metric names across all services.
 *
 * Metric names are a public contract: dashboards, alert rules and recording
 * rules all reference them by string. Defining them once here prevents typos
 * and drift between the code that emits a metric and the code that reads it.
 */
export const MetricNames = {
  // HTTP (RED) metrics — emitted by the shared HTTP metrics middleware.
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION_SECONDS: 'http_request_duration_seconds',
  HTTP_ACTIVE_REQUESTS: 'http_active_requests',

  // Order business metrics.
  ORDERS_CREATED_TOTAL: 'orders_created_total',
  ORDERS_CONFIRMED_TOTAL: 'orders_confirmed_total',
  ORDERS_CANCELLED_TOTAL: 'orders_cancelled_total',

  // Payment business metrics.
  PAYMENT_SUCCEEDED_TOTAL: 'payment_succeeded_total',
  PAYMENT_FAILED_TOTAL: 'payment_failed_total',
  PAYMENT_CIRCUIT_BREAKER_STATE: 'payment_circuit_breaker_state',
} as const;

export type MetricName = (typeof MetricNames)[keyof typeof MetricNames];
