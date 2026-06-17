import { Publisher, Consumer, setupTopology, Exchanges, Queues, createLogger } from '@nexuspay/shared';
import amqp, { ChannelModel } from 'amqplib';

import { orderRepository } from '../../app';
import { config } from '../../config';
import { getDatabase } from '../../infrastructure/database/connection';
import { OutboxPoller } from '../../infrastructure/messaging/OutboxPoller';
import { KnexOutboxRepository } from '../../infrastructure/repositories/KnexOutboxRepository';
import { KnexSagaStepRepository } from '../../infrastructure/repositories/KnexSagaStepRepository';

import { OrderEventHandlers } from './eventHandlers';

const logger = createLogger({ service: 'order-service', component: 'messaging' });

export interface MessagingHandle {
  stop: () => Promise<void>;
}

/**
 * Connect to RabbitMQ, declare the topology, start the saga consumers, and
 * start the outbox poller. Returns a handle to stop everything on shutdown.
 */
export async function startMessaging(): Promise<MessagingHandle> {
  const connection: ChannelModel = await amqp.connect(config.RABBITMQ_URL);
  const confirmChannel = await connection.createConfirmChannel();
  const channel = await connection.createChannel();
  await channel.prefetch(10);
  await setupTopology(channel);

  const publisher = new Publisher(confirmChannel, logger);

  const db = getDatabase();
  const outboxRepository = new KnexOutboxRepository(db);
  const sagaStepRepository = new KnexSagaStepRepository(db);

  const orderHandlers = new OrderEventHandlers(orderRepository, sagaStepRepository);
  const consumer = new Consumer(channel, logger);
  await consumer.consume(Queues.ORDER_PAYMENT_EVENTS, orderHandlers.handle);
  await consumer.consume(Queues.ORDER_INVENTORY_EVENTS, orderHandlers.handle);

  const poller = new OutboxPoller(outboxRepository, publisher, {
    intervalMs: 500,
    batchSize: 100,
    exchange: Exchanges.ORDER,
  });
  poller.start();

  logger.info('Order messaging started (consumers + outbox poller)');

  return {
    stop: async () => {
      poller.stop();
      await channel.close();
      await confirmChannel.close();
      await connection.close();
    },
  };
}
