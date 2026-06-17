import { randomUUID } from 'node:crypto';

import knex, { Knex } from 'knex';

import { AuditAppendInput } from '../../src/application/ports/AuditRepository';
import { up as createAuditEvents } from '../../src/infrastructure/database/migrations/001_create_audit_events_table';
import { KnexAuditRepository } from '../../src/infrastructure/repositories/KnexAuditRepository';

/**
 * Integration tests for the append-only audit store against a real
 * PostgreSQL instance. Gated behind RUN_INTEGRATION_DB=1 so the default
 * test run stays green without Docker:
 *
 *   docker-compose up -d postgres-audit
 *   RUN_INTEGRATION_DB=1 npm test --workspace @nexuspay/audit-service
 */
const SHOULD_RUN = process.env.RUN_INTEGRATION_DB === '1';
const describeDb = SHOULD_RUN ? describe : describe.skip;

const DB_URL =
  process.env.AUDIT_DB_URL ?? 'postgres://nexuspay:nexuspay_dev@localhost:5436/nexuspay_audit';

const makeInput = (over: Partial<AuditAppendInput> = {}): AuditAppendInput => ({
  eventId: randomUUID(),
  eventType: 'order.created',
  source: 'order-service',
  aggregateType: 'order',
  aggregateId: randomUUID(),
  correlationId: randomUUID(),
  causationId: randomUUID(),
  payload: { hello: 'world' },
  occurredAt: new Date(),
  ...over,
});

describeDb('KnexAuditRepository (PostgreSQL)', () => {
  let db: Knex;
  let repo: KnexAuditRepository;

  beforeAll(async () => {
    db = knex({ client: 'pg', connection: DB_URL });
    await db.schema.dropTableIfExists('audit_events');
    await createAuditEvents(db);
    repo = new KnexAuditRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('audit_events').delete();
  });

  it('records an event and returns it by aggregate id', async () => {
    const input = makeInput();
    await repo.append(input);

    const page = await repo.findByAggregateId(input.aggregateId!, { limit: 10, offset: 0 });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.eventId).toBe(input.eventId);
  });

  it('is idempotent on event id (duplicate append is a no-op)', async () => {
    const input = makeInput();
    await repo.append(input);
    await repo.append(input);

    const page = await repo.findByAggregateId(input.aggregateId!, { limit: 10, offset: 0 });
    expect(page.data).toHaveLength(1);
  });

  it('searches by event type and reports hasMore', async () => {
    const aggregateId = randomUUID();
    await repo.append(makeInput({ aggregateId, eventType: 'order.created' }));
    await repo.append(makeInput({ aggregateId, eventType: 'payment.failed' }));
    await repo.append(makeInput({ aggregateId, eventType: 'payment.failed' }));

    const page = await repo.search({ eventType: 'payment.failed' }, { limit: 1, offset: 0 });
    expect(page.data).toHaveLength(1);
    expect(page.pagination.hasMore).toBe(true);
  });
});
