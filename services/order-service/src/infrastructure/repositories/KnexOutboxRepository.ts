import { Knex } from 'knex';

import {
  OutboxRepository,
  OutboxRecord,
} from '../../application/ports/OutboxRepository';

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  published: boolean;
  created_at: Date;
  published_at: Date | null;
}

/**
 * PostgreSQL implementation of the outbox read/relay side using Knex.
 *
 * The write side lives in KnexOrderRepository so events are inserted in
 * the same transaction as the order change. This class is used by the
 * poller to find unpublished events and mark them published after a
 * confirmed broker publish.
 */
export class KnexOutboxRepository implements OutboxRepository {
  constructor(private readonly db: Knex) {}

  async findUnpublished(limit: number): Promise<OutboxRecord[]> {
    const rows = await this.db<OutboxRow>('outbox_events')
      .where({ published: false })
      .orderBy('created_at', 'asc')
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: new Date(row.created_at),
    }));
  }

  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db('outbox_events')
      .whereIn('id', ids)
      .update({ published: true, published_at: new Date() });
  }
}
