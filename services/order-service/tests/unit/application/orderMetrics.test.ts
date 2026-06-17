import { randomUUID } from 'node:crypto';

import { Money, defaultRegistry } from '@nexuspay/shared';

import { CreateOrderCommand } from '../../../src/application/commands/CreateOrderCommand';
import { CreateOrderHandler } from '../../../src/application/handlers/CreateOrderHandler';
import { OrderRepository } from '../../../src/application/ports/OrderRepository';
import { Order } from '../../../src/domain/entities/Order';

// Grab the singleton counters from the shared registry (idempotent factory).
const createdCounter = defaultRegistry.counter({
  name: 'orders_created_total',
  help: 'Total number of orders created',
});

const makeCommand = (): CreateOrderCommand => ({
  customerId: randomUUID(),
  idempotencyKey: randomUUID(),
  currency: 'USD',
  items: [{ productId: randomUUID(), sku: 'SKU-1', quantity: 1, unitPrice: 10 }],
  shippingAddress: { line1: '1 Main St', city: 'Townsville', zip: '12345', country: 'US' },
});

describe('order business metrics', () => {
  let repo: { findByIdempotencyKey: jest.Mock; save: jest.Mock };
  let handler: CreateOrderHandler;

  beforeEach(() => {
    repo = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((order: Order) => Promise.resolve(order)),
    };
    handler = new CreateOrderHandler(repo as unknown as OrderRepository);
  });

  it('increments orders_created_total when a new order is created', async () => {
    const before = createdCounter.get();

    await handler.execute(makeCommand());

    expect(createdCounter.get()).toBe(before + 1);
  });

  it('does not increment on an idempotent replay', async () => {
    const existing = new Order({
      id: randomUUID(),
      customerId: randomUUID(),
      idempotencyKey: randomUUID(),
      currency: 'USD',
      items: [{ productId: randomUUID(), sku: 'SKU-1', quantity: 1, unitPrice: Money.of(10, 'USD') }],
    });
    repo.findByIdempotencyKey.mockResolvedValue(existing);
    const before = createdCounter.get();

    const result = await handler.execute(makeCommand());

    expect(result.isExisting).toBe(true);
    expect(createdCounter.get()).toBe(before);
  });

  it('exposes the counter in the rendered exposition output', async () => {
    await handler.execute(makeCommand());

    expect(defaultRegistry.render()).toContain('orders_created_total');
  });
});
