import { randomUUID } from 'node:crypto';

import { DomainEvent, EventType } from '@nexuspay/shared';
import pino from 'pino';

import { AuditRepository, AuditAppendInput } from '../../src/application/ports/AuditRepository';
import { AuditEventHandlers } from '../../src/interfaces/messaging/eventHandlers';

const logger = pino({ level: 'silent' });

const makeEvent = (type: string, data: Record<string, unknown>): DomainEvent => ({
  id: randomUUID(),
  type: type as DomainEvent['type'],
  source: 'order-service',
  timestamp: '2026-06-17T10:00:00.000Z',
  correlationId: 'corr-1',
  causationId: 'cause-1',
  data,
  metadata: { version: 1 },
});

describe('AuditEventHandlers mapping', () => {
  let appended: AuditAppendInput[];
  let repo: AuditRepository;
  let handlers: AuditEventHandlers;

  beforeEach(() => {
    appended = [];
    repo = {
      append: jest.fn().mockImplementation((input: AuditAppendInput) => {
        appended.push(input);
        return Promise.resolve();
      }),
      findByAggregateId: jest.fn(),
      search: jest.fn(),
    };
    handlers = new AuditEventHandlers(repo, logger);
  });

  it('derives aggregate type from the event type prefix and id from the payload', async () => {
    await handlers.handle(makeEvent(EventType.ORDER_CREATED, { orderId: 'o-123' }));

    expect(appended[0]).toMatchObject({
      eventType: 'order.created',
      aggregateType: 'order',
      aggregateId: 'o-123',
      source: 'order-service',
      correlationId: 'corr-1',
    });
    expect(appended[0]?.occurredAt).toEqual(new Date('2026-06-17T10:00:00.000Z'));
  });

  it('falls back to the correlation id when no id field is present', async () => {
    await handlers.handle(makeEvent(EventType.PAYMENT_FAILED, { reason: 'declined' }));

    expect(appended[0]?.aggregateId).toBe('corr-1');
    expect(appended[0]?.aggregateType).toBe('payment');
  });
});
