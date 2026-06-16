import {
  EventType,
  OrderCreatedPayload,
  OrderCancelledPayload,
  OrderConfirmedPayload,
} from '@nexuspay/shared';

import { Order } from '../../domain/entities/Order';
import { OutboxEventInput } from '../ports/OutboxRepository';

/**
 * Builders that turn an Order aggregate into an outbox event. Centralizing
 * them keeps the event payloads consistent across the handlers that emit
 * them.
 */
export function orderCreatedEvent(order: Order): OutboxEventInput {
  const payload: OrderCreatedPayload = {
    orderId: order.id,
    customerId: order.customerId,
    items: order.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
    })),
    totalAmount: order.totalAmount.toNumber(),
    currency: order.currency,
  };
  return {
    aggregateType: 'order',
    aggregateId: order.id,
    eventType: EventType.ORDER_CREATED,
    payload: { ...payload },
  };
}

export function orderCancelledEvent(order: Order, reason: string): OutboxEventInput {
  const payload: OrderCancelledPayload = {
    orderId: order.id,
    customerId: order.customerId,
    reason,
  };
  return {
    aggregateType: 'order',
    aggregateId: order.id,
    eventType: EventType.ORDER_CANCELLED,
    payload: { ...payload },
  };
}

export function orderConfirmedEvent(order: Order): OutboxEventInput {
  const payload: OrderConfirmedPayload = {
    orderId: order.id,
    customerId: order.customerId,
    totalAmount: order.totalAmount.toNumber(),
    currency: order.currency,
  };
  return {
    aggregateType: 'order',
    aggregateId: order.id,
    eventType: EventType.ORDER_CONFIRMED,
    payload: { ...payload },
  };
}
