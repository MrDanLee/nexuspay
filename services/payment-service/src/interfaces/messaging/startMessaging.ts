import { Publisher, Consumer, setupTopology, Queues, createLogger } from '@nexuspay/shared';
import amqp, { ChannelModel } from 'amqplib';

import { processPaymentHandler } from '../../app';
import { config } from '../../config';

import { PaymentEventHandlers } from './eventHandlers';

const logger = createLogger({ service: 'payment-service', component: 'messaging' });

export interface MessagingHandle {
  stop: () => Promise<void>;
}

/**
 * Connect to RabbitMQ, declare the topology, and start consuming
 * inventory.reserved events to process payments.
 */
export async function startMessaging(): Promise<MessagingHandle> {
  const connection: ChannelModel = await amqp.connect(config.RABBITMQ_URL);
  const confirmChannel = await connection.createConfirmChannel();
  const channel = await connection.createChannel();
  await channel.prefetch(10);
  await setupTopology(channel);

  const publisher = new Publisher(confirmChannel, logger);
  const handlers = new PaymentEventHandlers(processPaymentHandler, publisher);

  const consumer = new Consumer(channel, logger);
  await consumer.consume(Queues.PAYMENT_INVENTORY_EVENTS, handlers.handle);

  logger.info('Payment messaging started (consumer)');

  return {
    stop: async () => {
      await channel.close();
      await confirmChannel.close();
      await connection.close();
    },
  };
}
