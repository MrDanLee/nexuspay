import { ConfirmChannel } from 'amqplib';
import { Logger } from 'pino';

import { DomainEvent } from '../events/DomainEvent';

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
          headers: {
            correlationId: event.correlationId,
            causationId: event.causationId,
          },
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
}
