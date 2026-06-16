import { Payment } from '../../domain/entities/Payment';

/**
 * Port for payment persistence.
 *
 * Implementations persist the payment row and append the entity's
 * recorded domain events to the payment_events table in the same
 * transaction (event sourcing light).
 */
export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
  findByIdempotencyKey(key: string): Promise<Payment | null>;

  /** Insert a new payment and its initial events. */
  save(payment: Payment): Promise<Payment>;

  /**
   * Update an existing payment with optimistic locking and append any
   * newly recorded events. Throws ConflictError on version conflict.
   */
  update(payment: Payment): Promise<Payment>;
}
