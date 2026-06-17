import { randomUUID } from 'node:crypto';

import { Money, NotFoundError } from '@nexuspay/shared';

import { OrderRepository } from '../../../src/application/ports/OrderRepository';
import { SagaStepRepository, SagaStep } from '../../../src/application/ports/SagaStepRepository';
import { GetTimelineHandler } from '../../../src/application/queries/GetTimelineQuery';
import { Order } from '../../../src/domain/entities/Order';

const makeOrder = (customerId: string) =>
  new Order({
    id: randomUUID(),
    customerId,
    idempotencyKey: randomUUID(),
    currency: 'USD',
    items: [{ productId: randomUUID(), sku: 'SKU-1', quantity: 1, unitPrice: Money.of(10, 'USD') }],
  });

const steps: SagaStep[] = [
  { id: 's1', orderId: 'o', stepName: 'inventory_reserved', status: 'COMPLETED', retryCount: 0 },
  { id: 's2', orderId: 'o', stepName: 'payment_completed', status: 'COMPLETED', retryCount: 1 },
];

describe('GetTimelineHandler', () => {
  let orderRepo: { findById: jest.Mock };
  let sagaRepo: { findByOrderId: jest.Mock };
  let handler: GetTimelineHandler;

  beforeEach(() => {
    orderRepo = { findById: jest.fn() };
    sagaRepo = { findByOrderId: jest.fn().mockResolvedValue(steps) };
    handler = new GetTimelineHandler(
      orderRepo as unknown as OrderRepository,
      sagaRepo as unknown as SagaStepRepository,
    );
  });

  it('returns the status and steps for the owner', async () => {
    const order = makeOrder('cust-1');
    orderRepo.findById.mockResolvedValue(order);

    const result = await handler.execute(order.id, 'cust-1');

    expect(result.orderId).toBe(order.id);
    expect(result.status).toBe(order.status);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((s) => s.stepName)).toEqual([
      'inventory_reserved',
      'payment_completed',
    ]);
    expect(result.steps[1]?.retryCount).toBe(1);
  });

  it('throws NotFound for an order owned by someone else', async () => {
    const order = makeOrder('cust-1');
    orderRepo.findById.mockResolvedValue(order);

    await expect(handler.execute(order.id, 'cust-2')).rejects.toBeInstanceOf(NotFoundError);
    expect(sagaRepo.findByOrderId).not.toHaveBeenCalled();
  });

  it('throws NotFound for an unknown order', async () => {
    orderRepo.findById.mockResolvedValue(null);

    await expect(handler.execute(randomUUID(), 'cust-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
