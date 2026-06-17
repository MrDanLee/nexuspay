import { randomUUID } from 'node:crypto';

import { Money, Publisher } from '@nexuspay/shared';
import knex, { Knex } from 'knex';

import { OutboxEventInput } from '../../src/application/ports/OutboxRepository';
import { Order } from '../../src/domain/entities/Order';
import { up as createOrders } from '../../src/infrastructure/database/migrations/001_create_orders_table';
import { up as createOrderItems } from '../../src/infrastructure/database/migrations/002_create_order_items_table';
import { up as createOutbox } from '../../src/infrastructure/database/migrations/004_create_outbox_events_table';
import { OutboxPoller } from '../../src/infrastructure/messaging/OutboxPoller';
import { KnexOrderRepository } from '../../src/infrastructure/repositories/KnexOrderRepository';
import { KnexOutboxRepository } from '../../src/infrastructure/repositories/KnexOutboxRepository';

/**
 * Outbox integration tests against real PostgreSQL (gated behind
 * RUN_INTEGRATION_DB=1). The broker is stubbed with a fake Publisher so
 * these isolate the DB/transactional behaviour.
 */
const SHOULD_RUN = process.env.RUN_INTEGRATION_DB === '1';
const describeDb = SHOULD_RUN ? describe : describe.skip;

const DB_URL =
  process.env.ORDER_DB_URL ?? 'postgres://nexuspay:nexuspay_dev@localhost:5433/nexuspay_orders';

const makeOrder = () =>
  new Order({
    customerId: randomUUID(),
    idempotencyKey: randomUUID(),
    currency: 'USD',
    items: [{ productId: randomUUID(), sku: 'SKU-1', quantity: 1, unitPrice: Money.of(10, 'USD') }],
  });

const outboxEvent = (aggregateId: string): OutboxEventInput => ({
  aggregateType: 'order',
  aggregateId,
  eventType: 'order.created',
  payload: { orderId: aggregateId, total: '10.00' },
});

describeDb('Outbox pattern (PostgreSQL)', () => {
  let db: Knex;
  let orders: KnexOrderRepository;
  let outbox: KnexOutboxRepository;

  beforeAll(async () => {
    db = knex({ client: 'pg', connection: DB_URL, pool: { min: 1, max: 5 } });
    await db.schema.dropTableIfExists('outbox_events');
    await db.schema.dropTableIfExists('order_items');
    await db.schema.dropTableIfExists('orders');
    await createOrders(db);
    await createOrderItems(db);
    await createOutbox(db);
    orders = new KnexOrderRepository(db);
    outbox = new KnexOutboxRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  beforeEach(async () => {
    await db('outbox_events').del();
    await db('order_items').del();
    await db('orders').del();
  });

  it('writes the event to the outbox in the same transaction as the order', async () => {
    const order = makeOrder();
    const saved = await orders.save(order, [outboxEvent(randomUUID())]);

    const orderRows = await db('orders').where({ id: saved.id });
    const events = await outbox.findUnpublished(10);

    expect(orderRows).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('order.created');
  });

  it('publishes pending events and marks them published', async () => {
    await orders.save(makeOrder(), [outboxEvent(randomUUID())]);

    const publish = jest.fn().mockResolvedValue(undefined);
    const publisher = { publish } as unknown as Publisher;
    const poller = new OutboxPoller(outbox, publisher, {
      intervalMs: 1000,
      batchSize: 100,
      exchange: 'order.events',
    });

    const count = await poller.poll();

    expect(count).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await outbox.findUnpublished(10)).toHaveLength(0);
  });

  it('leaves events unpublished when the broker is down', async () => {
    await orders.save(makeOrder(), [outboxEvent(randomUUID())]);

    const publish = jest.fn().mockRejectedValue(new Error('broker down'));
    const publisher = { publish } as unknown as Publisher;
    const poller = new OutboxPoller(outbox, publisher, {
      intervalMs: 1000,
      batchSize: 100,
      exchange: 'order.events',
    });

    const count = await poller.poll();

    expect(count).toBe(0);
    expect(await outbox.findUnpublished(10)).toHaveLength(1);
  });
});
