import { randomUUID } from 'node:crypto';

import { DomainEvent, EventType, Exchanges, Publisher, ConflictError } from '@nexuspay/shared';

import { ReleaseStockHandler } from '../../../src/application/handlers/ReleaseStockHandler';
import { ReserveStockHandler } from '../../../src/application/handlers/ReserveStockHandler';
import { InventoryEventHandlers } from '../../../src/interfaces/messaging/eventHandlers';

const makeEvent = (type: string, data: Record<string, unknown>): DomainEvent => ({
  id: randomUUID(),
  type: type as DomainEvent['type'],
  source: 'test',
  timestamp: new Date().toISOString(),
  correlationId: randomUUID(),
  causationId: randomUUID(),
  data,
  metadata: { version: 1 },
});

describe('InventoryEventHandlers', () => {
  let reserve: { execute: jest.Mock };
  let release: { execute: jest.Mock };
  let publish: jest.Mock;
  let handlers: InventoryEventHandlers;

  beforeEach(() => {
    reserve = { execute: jest.fn() };
    release = { execute: jest.fn() };
    publish = jest.fn().mockResolvedValue(undefined);
    handlers = new InventoryEventHandlers(
      reserve as unknown as ReserveStockHandler,
      release as unknown as ReleaseStockHandler,
      { publish } as unknown as Publisher,
    );
  });

  it('reserves stock and emits inventory.reserved on OrderCreated', async () => {
    reserve.execute.mockResolvedValue({
      orderId: 'order-1',
      reservations: [{ sku: 'SKU-1', quantity: 2, reservationId: 'res-1' }],
    });

    await handlers.handle(
      makeEvent(EventType.ORDER_CREATED, {
        orderId: 'order-1',
        items: [{ sku: 'SKU-1', quantity: 2 }],
      }),
    );

    expect(reserve.execute).toHaveBeenCalledWith({
      orderId: 'order-1',
      items: [{ sku: 'SKU-1', quantity: 2 }],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey, event] = publish.mock.calls[0];
    expect(exchange).toBe(Exchanges.INVENTORY);
    expect(routingKey).toBe(EventType.INVENTORY_RESERVED);
    expect(event.data.orderId).toBe('order-1');
  });

  it('emits inventory.failed when reservation fails', async () => {
    reserve.execute.mockRejectedValue(new ConflictError('Insufficient stock for SKU SKU-1'));

    await handlers.handle(
      makeEvent(EventType.ORDER_CREATED, {
        orderId: 'order-2',
        items: [{ sku: 'SKU-1', quantity: 99 }],
      }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
    const [, routingKey, event] = publish.mock.calls[0];
    expect(routingKey).toBe(EventType.INVENTORY_FAILED);
    expect(event.data.reason).toContain('Insufficient stock');
  });

  it('releases stock and emits inventory.released on OrderCancelled', async () => {
    release.execute.mockResolvedValue({ orderId: 'order-3', releasedCount: 2 });

    await handlers.handle(makeEvent(EventType.ORDER_CANCELLED, { orderId: 'order-3' }));

    expect(release.execute).toHaveBeenCalledWith({ orderId: 'order-3' });
    const [, routingKey] = publish.mock.calls[0];
    expect(routingKey).toBe(EventType.INVENTORY_RELEASED);
  });

  it('does not emit when there is nothing to release', async () => {
    release.execute.mockResolvedValue({ orderId: 'order-4', releasedCount: 0 });

    await handlers.handle(makeEvent(EventType.ORDER_CANCELLED, { orderId: 'order-4' }));

    expect(publish).not.toHaveBeenCalled();
  });

  it('ignores unrelated event types', async () => {
    await handlers.handle(makeEvent(EventType.PAYMENT_COMPLETED, { orderId: 'order-5' }));

    expect(reserve.execute).not.toHaveBeenCalled();
    expect(release.execute).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
