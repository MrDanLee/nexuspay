import { randomUUID } from 'node:crypto';
import amqp, { ChannelModel, ConfirmChannel, Channel } from 'amqplib';
import pino from 'pino';

import { Publisher } from '../../src/messaging/Publisher';
import { Consumer } from '../../src/messaging/Consumer';
import { setupTopology, Exchanges, Queues } from '../../src/messaging/topology';
import { DomainEvent, EventType } from '../../src/events/DomainEvent';

/**
 * Round-trip messaging tests against a real RabbitMQ broker. Gated behind
 * RUN_INTEGRATION_RABBIT=1 so the default test run stays green:
 *
 *   docker-compose up -d rabbitmq
 *   RUN_INTEGRATION_RABBIT=1 npm test --workspace @nexuspay/shared
 */
const SHOULD_RUN = process.env.RUN_INTEGRATION_RABBIT === '1';
const describeMq = SHOULD_RUN ? describe : describe.skip;
const URL = process.env.RABBITMQ_URL ?? 'amqp://nexuspay:nexuspay_dev@localhost:5672';

const logger = pino({ level: 'silent' });

const makeEvent = (type: string): DomainEvent => ({
  id: randomUUID(),
  type: type as DomainEvent['type'],
  source: 'test',
  timestamp: new Date().toISOString(),
  correlationId: randomUUID(),
  causationId: randomUUID(),
  data: { hello: 'world' },
  metadata: { version: 1 },
});

const waitFor = async <T>(getter: () => T | undefined, timeoutMs = 5000): Promise<T> => {
  const start = Date.now();
  for (;;) {
    const value = getter();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for message');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describeMq('Messaging (RabbitMQ)', () => {
  let connection: ChannelModel;
  let confirmChannel: ConfirmChannel;
  let channel: Channel;
  let publisher: Publisher;

  beforeAll(async () => {
    connection = await amqp.connect(URL);
    confirmChannel = await connection.createConfirmChannel();
    channel = await connection.createChannel();
    await channel.prefetch(1);
    await setupTopology(channel);
    publisher = new Publisher(confirmChannel, logger);
  });

  afterAll(async () => {
    await channel?.close();
    await confirmChannel?.close();
    await connection?.close();
  });

  beforeEach(async () => {
    await channel.purgeQueue(Queues.INVENTORY_ORDER_EVENTS);
    await channel.purgeQueue(Queues.DEAD_LETTER);
  });

  it('round-trips an event from publish to consume', async () => {
    const received: DomainEvent[] = [];
    const consumer = new Consumer(channel, logger);
    await consumer.consume(Queues.INVENTORY_ORDER_EVENTS, async (event) => {
      received.push(event);
    });

    const event = makeEvent(EventType.ORDER_CREATED);
    await publisher.publish(Exchanges.ORDER, EventType.ORDER_CREATED, event);

    const got = await waitFor(() => received[0]);
    expect(got.id).toBe(event.id);
  });

  it('dead-letters a message after a failed retry', async () => {
    const consumer = new Consumer(channel, logger);
    await consumer.consume(Queues.INVENTORY_ORDER_EVENTS, async () => {
      throw new Error('handler always fails');
    });

    const dlqMessages: DomainEvent[] = [];
    const dlqConsumer = new Consumer(channel, logger);
    await dlqConsumer.consume(Queues.DEAD_LETTER, async (event) => {
      dlqMessages.push(event);
    });

    const event = makeEvent(EventType.ORDER_CREATED);
    await publisher.publish(Exchanges.ORDER, EventType.ORDER_CREATED, event);

    const dead = await waitFor(() => dlqMessages[0], 8000);
    expect(dead.id).toBe(event.id);
  });

  it('manual ack prevents redelivery', async () => {
    let count = 0;
    const consumer = new Consumer(channel, logger);
    await consumer.consume(Queues.INVENTORY_ORDER_EVENTS, async () => {
      count += 1;
    });

    await publisher.publish(Exchanges.ORDER, EventType.ORDER_CREATED, makeEvent(EventType.ORDER_CREATED));
    await waitFor(() => (count > 0 ? count : undefined));
    await new Promise((r) => setTimeout(r, 500));

    expect(count).toBe(1);
  });
});
