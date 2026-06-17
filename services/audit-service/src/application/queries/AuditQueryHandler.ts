import {
  AuditRepository,
  AuditSearchFilter,
  PaginatedAuditEvents,
} from '../ports/AuditRepository';

export interface AuditQueryOptions {
  defaultLimit: number;
  maxLimit: number;
}

export interface QueryPageInput {
  limit?: number;
  offset?: number;
}

/**
 * Read-side handler for the audit API.
 *
 * Clamps pagination to safe bounds (so a client cannot request an unbounded
 * page) and delegates to the repository.
 */
export class AuditQueryHandler {
  constructor(
    private readonly repository: AuditRepository,
    private readonly options: AuditQueryOptions,
  ) {}

  byAggregate(aggregateId: string, page: QueryPageInput = {}): Promise<PaginatedAuditEvents> {
    return this.repository.findByAggregateId(aggregateId, this.resolvePage(page));
  }

  search(
    filter: AuditSearchFilter,
    page: QueryPageInput = {},
  ): Promise<PaginatedAuditEvents> {
    return this.repository.search(filter, this.resolvePage(page));
  }

  private resolvePage(page: QueryPageInput): { limit: number; offset: number } {
    const limit = Math.min(Math.max(1, page.limit ?? this.options.defaultLimit), this.options.maxLimit);
    const offset = Math.max(0, page.offset ?? 0);
    return { limit, offset };
  }
}
