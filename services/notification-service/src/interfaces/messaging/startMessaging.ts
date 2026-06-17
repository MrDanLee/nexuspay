import { Consumer, setupTopology, Queues, RedisClient, createLogger } from '@nexuspay/shared';
import amqp, { ChannelModel } from 'amqplib';

import { ConsumeOnceGuard } from '../../application/ConsumeOnceGuard';
import { NotificationDispatcher } from '../../application/NotificationDispatcher';
import { config } from '../../config';

import { NotificationEventHandlers } from './eventHandlers';

const logger = createLogger({ service: 'notification-service', component: 'messaging' });

export interface MessagingHandle {
  stop: () => Promise<void>;
}

/**
 * Connect to RabbitMQ, declare the topology, and start consuming the
 * customer-facing events that produce notifications.
 */
export async function startMessaging(): Promise<MessagingHandle> {
  const connection: ChannelModel = await amqp.connect(config.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.prefetch(10);
  await setupTopology(channel);

  const redis = new RedisClient(config.REDIS_URL, logger);
  const dispatcher = new NotificationDispatcher(logger);
  const guard = new ConsumeOnceGuard(redis, config.DEDUP_TTL_SECONDS, logger);
  const handlers = new NotificationEventHandlers(dispatcher, guard, logger);

  const consumer = new Consumer(channel, logger);
  await consumer.consume(Queues.NOTIFICATION_EVENTS, handlers.handle);

  logger.info('Notification messaging started (consumer)');

  return {
    stop: async () => {
      await channel.close();
      await connection.close();
      await redis.close();
    },
  };
}
