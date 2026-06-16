import amqp, { ChannelModel } from 'amqplib';
import { Consumer, setupTopology, Queues, createLogger } from '@nexuspay/shared';

import { config } from '../../config';
import { auditRepository } from '../../app';

import { AuditEventHandlers } from './eventHandlers';

const logger = createLogger({ service: 'audit-service', component: 'messaging' });

export interface MessagingHandle {
  stop: () => Promise<void>;
}

/**
 * Connect to RabbitMQ, declare the topology, and start consuming every domain
 * event into the append-only audit log.
 */
export async function startMessaging(): Promise<MessagingHandle> {
  const connection: ChannelModel = await amqp.connect(config.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.prefetch(20);
  await setupTopology(channel);

  const handlers = new AuditEventHandlers(auditRepository, logger);
  const consumer = new Consumer(channel, logger);
  await consumer.consume(Queues.AUDIT_EVENTS, handlers.handle);

  logger.info('Audit messaging started (consumer)');

  return {
    stop: async () => {
      await channel.close();
      await connection.close();
    },
  };
}
