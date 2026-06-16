import { Channel } from 'amqplib';
import { Logger } from 'pino';

import { DomainEvent } from '../events/DomainEvent';

export type EventHandler = (event: DomainEvent) => Promise<void>;

/**
 * Consumes domain events from a queue with manual acknowledgment.
 *
 * Delivery policy:
 * - success           -> ack (message removed)
 * - first failure     -> nack + requeue (one retry)
 * - repeated failure  -> nack without requeue -> routed to the queue's
 *   dead-letter exchange (configured in the topology)
 * - unparseable body  -> dead-lettered immediately
 *
 * Manual ack means a crash mid-processing leaves the message unacked, so
 * it is redelivered rather than lost (at-least-once).
 */
export class Consumer {
  constructor(
    private readonly channel: Channel,
    private readonly logger: Logger,
  ) {}

  async consume(queue: string, handler: EventHandler): Promise<void> {
    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      let event: DomainEvent;
      try {
        event = JSON.parse(msg.content.toString()) as DomainEvent;
      } catch (err) {
        this.logger.error({ err, queue }, 'Unparseable message, dead-lettering');
        this.channel.nack(msg, false, false);
        return;
      }

      try {
        await handler(event);
        this.channel.ack(msg);
      } catch (err) {
        if (msg.fields.redelivered) {
          this.logger.error(
            { err, queue, eventId: event.id, type: event.type },
            'Handler failed after retry, dead-lettering',
          );
          this.channel.nack(msg, false, false);
        } else {
          this.logger.warn(
            { err, queue, eventId: event.id, type: event.type },
            'Handler failed, requeueing for retry',
          );
          this.channel.nack(msg, false, true);
        }
      }
    });

    this.logger.info({ queue }, 'Consumer started');
  }
}
