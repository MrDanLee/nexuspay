import { randomUUID } from 'node:crypto';

import { DomainEvent, EventType } from '@nexuspay/shared';
import pino from 'pino';

import { ConsumeOnceGuard } from '../../src/application/ConsumeOnceGuard';
import { NotificationDispatcher } from '../../src/application/NotificationDispatcher';
import { NotificationEventHandlers } from '../../src/interfaces/messaging/eventHandlers';

const logger = pino({ level: 'silent' });

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

describe('NotificationEventHandlers', () => {
  let dispatcher: NotificationDispatcher;
  let dispatchSpy: jest.SpyInstance;

  beforeEach(() => {
    dispatcher = new NotificationDispatcher(logger);
    dispatchSpy = jest.spyOn(dispatcher, 'dispatch');
  });

  it('dispatches a notification for a first-seen event', async () => {
    const guard = { claim: jest.fn().mockResolvedValue(true) } as unknown as ConsumeOnceGuard;
    const handlers = new NotificationEventHandlers(dispatcher, guard, logger);

    await handlers.handle(makeEvent(EventType.ORDER_CONFIRMED, { orderId: 'o-1', customerId: 'c-1' }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('skips dispatch for a duplicate event', async () => {
    const guard = { claim: jest.fn().mockResolvedValue(false) } as unknown as ConsumeOnceGuard;
    const handlers = new NotificationEventHandlers(dispatcher, guard, logger);

    await handlers.handle(makeEvent(EventType.ORDER_CONFIRMED, { orderId: 'o-1' }));

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
