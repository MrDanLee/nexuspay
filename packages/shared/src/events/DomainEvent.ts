/**
 * Base interface for all domain events in the system.
 *
 * Every event flowing through RabbitMQ conforms to this shape.
 * This enables consistent serialization, deserialization, and
 * routing across all services.
 */
export interface DomainEvent<T = Record<string, unknown>> {
  /** Unique event identifier (UUID v4) */
  id: string;

  /** Event type for routing (e.g., "order.created") */
  type: EventType;

  /** Service that produced this event */
  source: string;

  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;

  /** Trace ID for correlating events across services */
  correlationId: string;

  /** ID of the event that caused this one (for causal chains) */
  causationId: string;

  /** Event-specific payload */
  data: T;

  /** Event metadata */
  metadata: EventMetadata;
}

export interface EventMetadata {
  /** Schema version for backward compatibility */
  version: number;

  /** User who triggered the action (if applicable) */
  userId?: string;

  /**
   * W3C traceparent captured when the event was produced. Lets an event
   * published outside a request (e.g. by the outbox poller) still carry the
   * originating trace across the broker.
   */
  traceparent?: string;
}

/**
 * All event types in the system.
 *
 * Using a const enum-like object for type safety while keeping
 * the values as plain strings for RabbitMQ routing keys.
 */
export const EventType = {
  // Order events
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_EXPIRED: 'order.expired',

  // Inventory events
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_RELEASED: 'inventory.released',
  INVENTORY_FAILED: 'inventory.failed',

  // Payment events
  PAYMENT_PROCESSING: 'payment.processing',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',

  // Notification events
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

// ─── Event Payload Types ────────────────────────────────────

export interface OrderCreatedPayload {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  currency: string;
}

export interface OrderConfirmedPayload {
  orderId: string;
  customerId: string;
  totalAmount: number;
  currency: string;
}

export interface OrderCancelledPayload {
  orderId: string;
  customerId: string;
  reason: string;
}

export interface InventoryReservedPayload {
  orderId: string;
  reservations: Array<{
    productId: string;
    sku: string;
    quantity: number;
    reservationId: string;
  }>;
}

export interface InventoryFailedPayload {
  orderId: string;
  reason: string;
  failedItems: Array<{
    sku: string;
    requested: number;
    available: number;
  }>;
}

export interface PaymentCompletedPayload {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  gatewayTransactionId: string;
}

export interface PaymentFailedPayload {
  orderId: string;
  paymentId: string;
  reason: string;
  retryable: boolean;
}