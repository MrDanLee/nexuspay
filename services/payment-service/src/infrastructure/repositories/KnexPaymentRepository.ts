import { Knex } from 'knex';
import { Money, ConflictError } from '@nexuspay/shared';

import { Payment, RecordedPaymentEvent } from '../../domain/entities/Payment';
import { PaymentStatus } from '../../domain/value-objects/PaymentStatus';
import { PaymentRepository } from '../../application/ports/PaymentRepository';

interface PaymentRow {
  id: string;
  order_id: string;
  customer_id: string | null;
  status: PaymentStatus;
  amount: string;
  currency: string;
  idempotency_key: string;
  gateway_transaction_id: string | null;
  failure_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * PostgreSQL implementation of PaymentRepository using Knex.
 *
 * Event sourcing light: every state transition recorded on the entity is
 * appended to the payment_events table in the same transaction as the
 * payment row update, so a payment's timeline is fully reconstructable.
 * Updates use optimistic locking; because the entity may record several
 * transitions before a single update, the expected (pre-update) version is
 * derived as `version - events.length`.
 */
export class KnexPaymentRepository implements PaymentRepository {
  constructor(private readonly db: Knex) {}

  async findById(id: string): Promise<Payment | null> {
    const row = await this.db<PaymentRow>('payments').where({ id }).first();
    return row ? this.toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const row = await this.db<PaymentRow>('payments').where({ order_id: orderId }).first();
    return row ? this.toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    const row = await this.db<PaymentRow>('payments').where({ idempotency_key: key }).first();
    return row ? this.toDomain(row) : null;
  }

  async save(payment: Payment): Promise<Payment> {
    const events = payment.pullEvents();

    return this.db.transaction(async (trx) => {
      const [row] = (await trx('payments')
        .insert({
          order_id: payment.orderId,
          customer_id: payment.customerId ?? null,
          status: payment.status,
          amount: payment.amount.toFixed(),
          currency: payment.amount.currency,
          idempotency_key: payment.idempotencyKey,
          gateway_transaction_id: payment.gatewayTransactionId ?? null,
          failure_reason: payment.failureReason ?? null,
          version: payment.version,
        })
        .returning('*')) as PaymentRow[];

      if (!row) {
        throw new Error('Failed to insert payment: no row returned');
      }

      await this.appendEvents(trx, row.id, events);
      return this.toDomain(row);
    });
  }

  async update(payment: Payment): Promise<Payment> {
    const events = payment.pullEvents();
    const expectedVersion = payment.version - events.length;

    return this.db.transaction(async (trx) => {
      const [row] = (await trx('payments')
        .where({ id: payment.id, version: expectedVersion })
        .update({
          status: payment.status,
          gateway_transaction_id: payment.gatewayTransactionId ?? null,
          failure_reason: payment.failureReason ?? null,
          version: payment.version,
          updated_at: new Date(),
        })
        .returning('*')) as PaymentRow[];

      if (!row) {
        throw new ConflictError(
          `Payment ${payment.id} was modified by another process (version conflict)`,
          { metadata: { paymentId: payment.id, expectedVersion } },
        );
      }

      await this.appendEvents(trx, row.id, events);
      return this.toDomain(row);
    });
  }

  private async appendEvents(
    trx: Knex.Transaction,
    paymentId: string,
    events: RecordedPaymentEvent[],
  ): Promise<void> {
    if (events.length === 0) return;
    await trx('payment_events').insert(
      events.map((event) => ({
        payment_id: paymentId,
        event_type: event.eventType,
        from_status: event.fromStatus,
        to_status: event.toStatus,
        payload: event.payload,
      })),
    );
  }

  private toDomain(row: PaymentRow): Payment {
    return new Payment({
      id: row.id,
      orderId: row.order_id,
      customerId: row.customer_id ?? undefined,
      amount: Money.of(row.amount, row.currency),
      idempotencyKey: row.idempotency_key,
      status: row.status,
      gatewayTransactionId: row.gateway_transaction_id ?? undefined,
      failureReason: row.failure_reason ?? undefined,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
