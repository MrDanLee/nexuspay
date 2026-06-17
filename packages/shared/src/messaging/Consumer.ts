import { randomUUID } from 'node:crypto';

import { Channel } from 'amqplib';
import { Logger } from 'pino';

import { RequestContext } from '../context/RequestContext';
import { DomainEvent } from '../events/DomainEvent';
import { continueTrace } from '../observability/trace';

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

      // Continue the producer's trace on this hop (fresh span id), so logs and
      // any events this handler emits stay correlated end to end.
      const headerTraceparent =
        (msg.properties.headers?.traceparent as string | undefined) ??
        event.metadata.traceparent;
      const trace = continueTrace(headerTraceparent);

      await RequestContext.run(
        {
          requestId: randomUUID(),
          correlationId: event.correlationId,
          userId: event.metadata.userId,
          startTime: Date.now(),
          traceId: trace.traceId,
          spanId: trace.spanId,
        },
        async () => {
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
        },
      );
    });

    this.logger.info({ queue }, 'Consumer started');
  }
}
