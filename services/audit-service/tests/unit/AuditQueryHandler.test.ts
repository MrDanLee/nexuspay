import { AuditQueryHandler } from '../../src/application/queries/AuditQueryHandler';
import {
  AuditRepository,
  AuditPagination,
  PaginatedAuditEvents,
} from '../../src/application/ports/AuditRepository';

const emptyPage: PaginatedAuditEvents = {
  data: [],
  pagination: { limit: 0, offset: 0, hasMore: false },
};

describe('AuditQueryHandler pagination clamping', () => {
  let repo: { findByAggregateId: jest.Mock; search: jest.Mock };
  let handler: AuditQueryHandler;
  const captured: AuditPagination[] = [];

  beforeEach(() => {
    captured.length = 0;
    repo = {
      findByAggregateId: jest.fn().mockImplementation((_id, page: AuditPagination) => {
        captured.push(page);
        return Promise.resolve(emptyPage);
      }),
      search: jest.fn().mockImplementation((_f, page: AuditPagination) => {
        captured.push(page);
        return Promise.resolve(emptyPage);
      }),
    };
    handler = new AuditQueryHandler(repo as unknown as AuditRepository, {
      defaultLimit: 50,
      maxLimit: 200,
    });
  });

  it('applies the default limit when none is given', async () => {
    await handler.byAggregate('agg-1');
    expect(captured[0]).toEqual({ limit: 50, offset: 0 });
  });

  it('caps the limit at maxLimit', async () => {
    await handler.search({}, { limit: 10_000 });
    expect(captured[0]?.limit).toBe(200);
  });

  it('floors the limit at 1 and offset at 0', async () => {
    await handler.search({}, { limit: 0, offset: -5 });
    expect(captured[0]).toEqual({ limit: 1, offset: 0 });
  });

  it('passes through a valid page unchanged', async () => {
    await handler.byAggregate('agg-1', { limit: 25, offset: 100 });
    expect(captured[0]).toEqual({ limit: 25, offset: 100 });
  });
});
