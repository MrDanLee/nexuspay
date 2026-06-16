import { Publisher, DomainEvent, EventType, createLogger } from '@nexuspay/shared';

import { OutboxRepository, OutboxRecord } from '../../application/ports/OutboxRepository';

const logger = createLogger({ service: 'order-service', component: 'OutboxPoller' });

export interface OutboxPollerOptions {
  intervalMs: number;
  batchSize: number;
  /** Exchange the order events are published to. */
  exchange: string;
}

/**
 * Relays unpublished outbox events to RabbitMQ.
 *
 * Polls the outbox on a fixed interval, publishes each pending event with
 * publisher confirms, and only marks events published after the broker
 * confirms. Publishing stops at the first failure in a batch so ordering
 * is preserved and the failed event is retried on the next poll. A
 * reentrancy guard prevents overlapping polls.
 */
export class OutboxPoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: Publisher,
    private readonly options: OutboxPollerOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.poll();
    }, this.options.intervalMs);
    this.timer.unref();
    logger.info({ intervalMs: this.options.intervalMs }, 'Outbox poller started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Outbox poller stopped');
    }
  }

  /**
   * Publish one batch of pending events. Returns the number published.
   */
  async poll(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      const events = await this.outbox.findUnpublished(this.options.batchSize);
      if (events.length === 0) return 0;

      const published: string[] = [];
      for (const event of events) {
        try {
          await this.publisher.publish(this.options.exchange, event.eventType, this.toDomainEvent(event));
          published.push(event.id);
        } catch (error) {
          logger.error({ err: error, eventId: event.id }, 'Failed to publish outbox event');
          break; // preserve order; retry this and later events next poll
        }
      }

      if (published.length > 0) {
        await this.outbox.markPublished(published);
        logger.debug({ count: published.length }, 'Published outbox events');
      }
      return published.length;
    } catch (error) {
      logger.error({ err: error }, 'Outbox poll failed');
      return 0;
    } finally {
      this.running = false;
    }
  }

  private toDomainEvent(record: OutboxRecord): DomainEvent {
    return {
      id: record.id,
      type: record.eventType as DomainEvent['type'],
      source: 'order-service',
      timestamp: record.createdAt.toISOString(),
      correlationId: record.aggregateId,
      causationId: record.id,
      data: record.payload,
      metadata: { version: 1 },
    };
  }
}

/** Routing keys this service emits, for reference at the call sites. */
export const OrderEventTypes = {
  CREATED: EventType.ORDER_CREATED,
  CONFIRMED: EventType.ORDER_CONFIRMED,
  CANCELLED: EventType.ORDER_CANCELLED,
} as const;
