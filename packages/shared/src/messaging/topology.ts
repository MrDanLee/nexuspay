import { Channel } from 'amqplib';

import { EventType } from '../events/DomainEvent';

/**
 * Topic exchanges, one per aggregate that emits events.
 */
export const Exchanges = {
  ORDER: 'order.events',
  INVENTORY: 'inventory.events',
  PAYMENT: 'payment.events',
  /** Dead-letter exchange for poison/failed messages. */
  DEAD_LETTER: 'nexuspay.dlx',
} as const;

/**
 * Durable queues, one per (consumer service, source exchange) pairing.
 */
export const Queues = {
  INVENTORY_ORDER_EVENTS: 'inventory.order-events',
  PAYMENT_INVENTORY_EVENTS: 'payment.inventory-events',
  ORDER_PAYMENT_EVENTS: 'order.payment-events',
  ORDER_INVENTORY_EVENTS: 'order.inventory-events',
  DEAD_LETTER: 'nexuspay.dlq',
} as const;

/**
 * Declare all exchanges, queues, and bindings for the saga.
 *
 * Idempotent: assert* calls are safe to run on every service start. Each
 * service queue dead-letters to a shared DLX/DLQ so failed messages are
 * inspectable rather than lost. Bindings encode the saga's event flow:
 *
 *   order.created/cancelled  -> inventory
 *   inventory.reserved       -> payment
 *   inventory.failed         -> order
 *   payment.completed/failed -> order
 */
export async function setupTopology(channel: Channel): Promise<void> {
  // Exchanges
  await channel.assertExchange(Exchanges.ORDER, 'topic', { durable: true });
  await channel.assertExchange(Exchanges.INVENTORY, 'topic', { durable: true });
  await channel.assertExchange(Exchanges.PAYMENT, 'topic', { durable: true });
  await channel.assertExchange(Exchanges.DEAD_LETTER, 'topic', { durable: true });

  // Dead-letter queue captures everything routed to the DLX.
  await channel.assertQueue(Queues.DEAD_LETTER, { durable: true });
  await channel.bindQueue(Queues.DEAD_LETTER, Exchanges.DEAD_LETTER, '#');

  const queueOptions = { durable: true, deadLetterExchange: Exchanges.DEAD_LETTER };

  // Inventory reacts to order lifecycle events.
  await channel.assertQueue(Queues.INVENTORY_ORDER_EVENTS, queueOptions);
  await channel.bindQueue(Queues.INVENTORY_ORDER_EVENTS, Exchanges.ORDER, EventType.ORDER_CREATED);
  await channel.bindQueue(Queues.INVENTORY_ORDER_EVENTS, Exchanges.ORDER, EventType.ORDER_CANCELLED);

  // Payment reacts to a successful reservation.
  await channel.assertQueue(Queues.PAYMENT_INVENTORY_EVENTS, queueOptions);
  await channel.bindQueue(
    Queues.PAYMENT_INVENTORY_EVENTS,
    Exchanges.INVENTORY,
    EventType.INVENTORY_RESERVED,
  );

  // Order reacts to payment outcomes.
  await channel.assertQueue(Queues.ORDER_PAYMENT_EVENTS, queueOptions);
  await channel.bindQueue(
    Queues.ORDER_PAYMENT_EVENTS,
    Exchanges.PAYMENT,
    EventType.PAYMENT_COMPLETED,
  );
  await channel.bindQueue(Queues.ORDER_PAYMENT_EVENTS, Exchanges.PAYMENT, EventType.PAYMENT_FAILED);

  // Order reacts to a failed reservation.
  await channel.assertQueue(Queues.ORDER_INVENTORY_EVENTS, queueOptions);
  await channel.bindQueue(
    Queues.ORDER_INVENTORY_EVENTS,
    Exchanges.INVENTORY,
    EventType.INVENTORY_FAILED,
  );
}
