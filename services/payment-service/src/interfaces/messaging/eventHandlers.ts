import { randomUUID } from 'node:crypto';
import {
  DomainEvent,
  EventType,
  Exchanges,
  Publisher,
  createLogger,
} from '@nexuspay/shared';

import { ProcessPaymentHandler } from '../../application/handlers/ProcessPaymentHandler';

const logger = createLogger({ service: 'payment-service', component: 'eventHandlers' });

interface InventoryReservedData {
  orderId: string;
  customerId?: string;
  totalAmount?: number;
  currency?: string;
}

/**
 * Consumes inventory.reserved and processes the payment for the order.
 *
 * Emits payment.completed on success or payment.failed otherwise (carrying
 * whether the failure was transient, so the saga can decide). The order id
 * is used as the payment idempotency key so a redelivered reservation event
 * never double-charges.
 */
export class PaymentEventHandlers {
  constructor(
    private readonly processPaymentHandler: ProcessPaymentHandler,
    private readonly publisher: Publisher,
  ) {}

  handle = async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case EventType.INVENTORY_RESERVED:
        await this.onInventoryReserved(event);
        break;
      default:
        logger.debug({ type: event.type }, 'Ignoring event');
    }
  };

  private async onInventoryReserved(event: DomainEvent): Promise<void> {
    const data = event.data as unknown as InventoryReservedData;

    const result = await this.processPaymentHandler.execute({
      orderId: data.orderId,
      customerId: data.customerId,
      amount: data.totalAmount ?? 0,
      currency: data.currency ?? 'USD',
      idempotencyKey: `payment-${data.orderId}`,
    });

    if (result.success) {
      await this.publish(EventType.PAYMENT_COMPLETED, event, {
        orderId: data.orderId,
        paymentId: result.payment.id,
        amount: result.payment.amount.toNumber(),
        currency: result.payment.amount.currency,
        gatewayTransactionId: result.payment.gatewayTransactionId,
      });
      logger.info({ orderId: data.orderId }, 'Payment completed, emitted payment.completed');
    } else {
      await this.publish(EventType.PAYMENT_FAILED, event, {
        orderId: data.orderId,
        paymentId: result.payment.id,
        reason: result.payment.failureReason ?? 'payment failed',
        retryable: false,
      });
      logger.warn({ orderId: data.orderId }, 'Payment failed, emitted payment.failed');
    }
  }

  private async publish(
    type: string,
    causedBy: DomainEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    const event: DomainEvent = {
      id: randomUUID(),
      type: type as DomainEvent['type'],
      source: 'payment-service',
      timestamp: new Date().toISOString(),
      correlationId: causedBy.correlationId,
      causationId: causedBy.id,
      data,
      metadata: { version: 1 },
    };
    await this.publisher.publish(Exchanges.PAYMENT, type, event);
  }
}
