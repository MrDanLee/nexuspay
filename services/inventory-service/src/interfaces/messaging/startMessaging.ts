import amqp, { ChannelModel } from 'amqplib';
import { Publisher, Consumer, setupTopology, Queues, createLogger } from '@nexuspay/shared';

import { config } from '../../config';
import { reserveStockHandler, releaseStockHandler } from '../../app';

import { InventoryEventHandlers } from './eventHandlers';

const logger = createLogger({ service: 'inventory-service', component: 'messaging' });

export interface MessagingHandle {
  stop: () => Promise<void>;
}

/**
 * Connect to RabbitMQ, declare the topology, and start consuming order
 * lifecycle events to drive stock reservations/releases.
 */
export async function startMessaging(): Promise<MessagingHandle> {
  const connection: ChannelModel = await amqp.connect(config.RABBITMQ_URL);
  const confirmChannel = await connection.createConfirmChannel();
  const channel = await connection.createChannel();
  await channel.prefetch(10);
  await setupTopology(channel);

  const publisher = new Publisher(confirmChannel, logger);
  const handlers = new InventoryEventHandlers(
    reserveStockHandler,
    releaseStockHandler,
    publisher,
  );

  const consumer = new Consumer(channel, logger);
  await consumer.consume(Queues.INVENTORY_ORDER_EVENTS, handlers.handle);

  logger.info('Inventory messaging started (consumer)');

  return {
    stop: async () => {
      await channel.close();
      await confirmChannel.close();
      await connection.close();
    },
  };
}
