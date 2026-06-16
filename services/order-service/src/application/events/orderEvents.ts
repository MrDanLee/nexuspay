import {
  EventType,
  OrderCreatedPayload,
  OrderCancelledPayload,
  OrderConfirmedPayload,
  RequestContext,
  formatTraceparent,
} from '@nexuspay/shared';

import { Order } from '../../domain/entities/Order';
import { OutboxEventInput } from '../ports/OutboxRepository';

/**
 * Capture the active trace as a traceparent so the outbox poller — which runs
 * outside any request — can still relay the originating trace across the
 * broker. Returns undefined when there is no active trace context.
 */
function traceMetadata(): Record<string, unknown> | undefined {
  const ctx = RequestContext.get();
  if (ctx?.traceId && ctx.spanId) {
    return {
      traceparent: formatTraceparent({ traceId: ctx.traceId, spanId: ctx.spanId, sampled: true }),
    };
  }
  return undefined;
}

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
    metadata: traceMetadata(),
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
    metadata: traceMetadata(),
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
    metadata: traceMetadata(),
  };
}
