/**
 * Order status with valid transition rules.
 *
 * The state machine ensures orders can only move through
 * valid states, preventing impossible transitions like
 * CANCELLED → CONFIRMED.
 */
export const OrderStatus = {
  CREATED: 'CREATED',
  INVENTORY_RESERVED: 'INVENTORY_RESERVED',
  INVENTORY_FAILED: 'INVENTORY_FAILED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * Valid state transitions.
 * Key: current status → Value: array of allowed next statuses
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [
    OrderStatus.INVENTORY_RESERVED,
    OrderStatus.INVENTORY_FAILED,
    OrderStatus.EXPIRED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.INVENTORY_RESERVED]: [
    OrderStatus.PAYMENT_PENDING,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAYMENT_PENDING]: [
    OrderStatus.CONFIRMED,
    OrderStatus.PAYMENT_FAILED,
  ],
  [OrderStatus.PAYMENT_FAILED]: [
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.INVENTORY_FAILED]: [
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: [],
};

/**
 * Check if a status transition is valid.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check if an order in this status can be cancelled.
 */
export function isCancellable(status: OrderStatus): boolean {
  return canTransition(status, OrderStatus.CANCELLED);
}

/**
 * Check if an order is in a terminal (final) state.
 */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}