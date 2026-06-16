/**
 * An audit entry to append. Built from a domain event by the consumer.
 */
export interface AuditAppendInput {
  eventId: string;
  eventType: string;
  source: string;
  aggregateType?: string;
  aggregateId?: string;
  correlationId?: string;
  causationId?: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface AuditEventRecord extends AuditAppendInput {
  id: string;
  recordedAt: Date;
}

export interface AuditSearchFilter {
  eventType?: string;
  aggregateId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditPagination {
  limit: number;
  offset: number;
}

export interface PaginatedAuditEvents {
  data: AuditEventRecord[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Port for the append-only audit store.
 *
 * `append` is idempotent on eventId. Reads are chronological (oldest first)
 * and paginated.
 */
export interface AuditRepository {
  append(input: AuditAppendInput): Promise<void>;
  findByAggregateId(
    aggregateId: string,
    pagination: AuditPagination,
  ): Promise<PaginatedAuditEvents>;
  search(filter: AuditSearchFilter, pagination: AuditPagination): Promise<PaginatedAuditEvents>;
}
