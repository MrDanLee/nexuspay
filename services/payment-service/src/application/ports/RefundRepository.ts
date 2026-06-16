export interface RefundRecord {
  id: string;
  paymentId: string;
  amount: string;
  currency: string;
  status: string;
  gatewayRefundId?: string;
  idempotencyKey: string;
  reason?: string;
}

export interface NewRefund {
  paymentId: string;
  amount: string;
  currency: string;
  status: string;
  gatewayRefundId?: string;
  idempotencyKey: string;
  reason?: string;
}

/**
 * Port for refund persistence. Kept separate from PaymentRepository so the
 * refund idempotency key has its own lookup independent of the payment.
 */
export interface RefundRepository {
  findByIdempotencyKey(key: string): Promise<RefundRecord | null>;
  save(refund: NewRefund): Promise<RefundRecord>;
}
