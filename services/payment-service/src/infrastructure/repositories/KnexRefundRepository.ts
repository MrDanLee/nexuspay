import { Knex } from 'knex';

import {
  RefundRepository,
  RefundRecord,
  NewRefund,
} from '../../application/ports/RefundRepository';

interface RefundRow {
  id: string;
  payment_id: string;
  amount: string;
  currency: string;
  status: string;
  gateway_refund_id: string | null;
  idempotency_key: string;
  reason: string | null;
  created_at: Date;
}

/**
 * PostgreSQL implementation of RefundRepository using Knex.
 */
export class KnexRefundRepository implements RefundRepository {
  constructor(private readonly db: Knex) {}

  async findByIdempotencyKey(key: string): Promise<RefundRecord | null> {
    const row = await this.db<RefundRow>('refunds').where({ idempotency_key: key }).first();
    return row ? this.toRecord(row) : null;
  }

  async save(refund: NewRefund): Promise<RefundRecord> {
    const [row] = (await this.db('refunds')
      .insert({
        payment_id: refund.paymentId,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        gateway_refund_id: refund.gatewayRefundId ?? null,
        idempotency_key: refund.idempotencyKey,
        reason: refund.reason ?? null,
      })
      .returning('*')) as RefundRow[];

    if (!row) {
      throw new Error('Failed to insert refund: no row returned');
    }

    return this.toRecord(row);
  }

  private toRecord(row: RefundRow): RefundRecord {
    return {
      id: row.id,
      paymentId: row.payment_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      gatewayRefundId: row.gateway_refund_id ?? undefined,
      idempotencyKey: row.idempotency_key,
      reason: row.reason ?? undefined,
    };
  }
}
