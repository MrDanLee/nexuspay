import { Knex } from 'knex';

import {
  AuditRepository,
  AuditAppendInput,
  AuditEventRecord,
  AuditSearchFilter,
  AuditPagination,
  PaginatedAuditEvents,
} from '../../application/ports/AuditRepository';

interface AuditRow {
  id: string;
  event_id: string;
  event_type: string;
  source: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  occurred_at: Date | null;
  recorded_at: Date;
}

/**
 * PostgreSQL implementation of the append-only audit store.
 *
 * Appends are idempotent via ON CONFLICT (event_id) DO NOTHING, so a
 * redelivered event is recorded once. There are no update/delete methods —
 * the log is immutable by construction.
 */
export class KnexAuditRepository implements AuditRepository {
  constructor(private readonly db: Knex) {}

  async append(input: AuditAppendInput): Promise<void> {
    await this.db('audit_events')
      .insert({
        event_id: input.eventId,
        event_type: input.eventType,
        source: input.source,
        aggregate_type: input.aggregateType ?? null,
        aggregate_id: input.aggregateId ?? null,
        correlation_id: input.correlationId ?? null,
        causation_id: input.causationId ?? null,
        payload: input.payload,
        metadata: input.metadata ?? null,
        occurred_at: input.occurredAt ?? null,
      })
      .onConflict('event_id')
      .ignore();
  }

  async findByAggregateId(
    aggregateId: string,
    pagination: AuditPagination,
  ): Promise<PaginatedAuditEvents> {
    const rows = await this.db<AuditRow>('audit_events')
      .where({ aggregate_id: aggregateId })
      .orderBy('recorded_at', 'asc')
      .offset(pagination.offset)
      .limit(pagination.limit + 1);

    return this.paginate(rows, pagination);
  }

  async search(
    filter: AuditSearchFilter,
    pagination: AuditPagination,
  ): Promise<PaginatedAuditEvents> {
    const query = this.db<AuditRow>('audit_events');

    if (filter.eventType) query.where({ event_type: filter.eventType });
    if (filter.aggregateId) query.where({ aggregate_id: filter.aggregateId });
    if (filter.from) query.where('recorded_at', '>=', filter.from);
    if (filter.to) query.where('recorded_at', '<=', filter.to);

    const rows = await query
      .orderBy('recorded_at', 'asc')
      .offset(pagination.offset)
      .limit(pagination.limit + 1);

    return this.paginate(rows, pagination);
  }

  /** Trim the extra look-ahead row to compute hasMore, then map to domain. */
  private paginate(rows: AuditRow[], pagination: AuditPagination): PaginatedAuditEvents {
    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    return {
      data: page.map((row) => this.toRecord(row)),
      pagination: { limit: pagination.limit, offset: pagination.offset, hasMore },
    };
  }

  private toRecord(row: AuditRow): AuditEventRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      eventType: row.event_type,
      source: row.source,
      aggregateType: row.aggregate_type ?? undefined,
      aggregateId: row.aggregate_id ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      causationId: row.causation_id ?? undefined,
      payload: row.payload,
      metadata: row.metadata ?? undefined,
      occurredAt: row.occurred_at ?? undefined,
      recordedAt: new Date(row.recorded_at),
    };
  }
}
