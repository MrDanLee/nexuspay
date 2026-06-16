/**
 * Payment status with valid transition rules.
 *
 *   PENDING ─▶ PROCESSING ─▶ COMPLETED ─▶ REFUND_PENDING ─▶ REFUNDED
 *      │            │
 *      └────────────┴────────▶ FAILED
 *
 * A refund attempt that fails returns REFUND_PENDING back to COMPLETED so
 * it can be retried.
 */
export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [PaymentStatus.PROCESSING, PaymentStatus.FAILED],
  [PaymentStatus.PROCESSING]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
  [PaymentStatus.COMPLETED]: [PaymentStatus.REFUND_PENDING],
  [PaymentStatus.REFUND_PENDING]: [PaymentStatus.REFUNDED, PaymentStatus.COMPLETED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: PaymentStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}
