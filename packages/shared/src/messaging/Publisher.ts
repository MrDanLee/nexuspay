import { ConfirmChannel } from 'amqplib';
import { Logger } from 'pino';

import { DomainEvent } from '../events/DomainEvent';
import { RequestContext } from '../context/RequestContext';
import { formatTraceparent } from '../observability/trace';

/**
 * Publishes domain events to RabbitMQ with publisher confirms.
 *
 * Publisher confirms make delivery reliable: publish() only resolves once
 * the broker has acknowledged the message, so a caller (e.g. the outbox
 * poller) can safely mark an event as published. Messages are persistent
 * so they survive a broker restart.
 */
export class Publisher {
  constructor(
    private readonly channel: ConfirmChannel,
    private readonly logger: Logger,
  ) {}

  /**
   * Publish a domain event and wait for the broker confirm.
   * @throws if the broker nacks the message.
   */
  async publish(exchange: string, routingKey: string, event: DomainEvent): Promise<void> {
    const content = Buffer.from(JSON.stringify(event));

    // Carry the active trace across the broker so the consuming service can
    // continue the same trace. Prefer a traceparent captured on the event
    // (e.g. by the outbox), falling back to the ambient request context.
    const headers: Record<string, string> = {
      correlationId: event.correlationId,
      causationId: event.causationId,
    };
    const traceparent = event.metadata.traceparent ?? this.currentTraceparent();
    if (traceparent) {
      headers.traceparent = traceparent;
    }

    await new Promise<void>((resolve, reject) => {
      this.channel.publish(
        exchange,
        routingKey,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: event.id,
          timestamp: Date.now(),
          headers,
        },
        (err) => {
          if (err) {
            this.logger.error({ err, exchange, routingKey, eventId: event.id }, 'Publish nacked');
            reject(err);
          } else {
            this.logger.debug({ exchange, routingKey, eventId: event.id }, 'Event published');
            resolve();
          }
        },
      );
    });
  }

  /** Build a traceparent from the ambient request context, if any. */
  private currentTraceparent(): string | undefined {
    const ctx = RequestContext.get();
    if (ctx?.traceId && ctx.spanId) {
      return formatTraceparent({ traceId: ctx.traceId, spanId: ctx.spanId, sampled: true });
    }
    return undefined;
  }
}
