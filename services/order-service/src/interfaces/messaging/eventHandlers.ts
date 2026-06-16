import { DomainEvent, EventType, createLogger } from '@nexuspay/shared';

import { OrderStatus } from '../../domain/value-objects/OrderStatus';
import { OrderRepository } from '../../application/ports/OrderRepository';
import { orderConfirmedEvent } from '../../application/events/orderEvents';

const logger = createLogger({ service: 'order-service', component: 'eventHandlers' });

/**
 * Drives the order through the saga as downstream events arrive.
 *
 * inventory.reserved advances CREATED -> INVENTORY_RESERVED -> PAYMENT_PENDING;
 * payment.completed confirms the order and emits order.confirmed. Each
 * handler is idempotent: if the order has already reached (or moved past)
 * the target state, the event is treated as a duplicate and ignored.
 */
export class OrderEventHandlers {
  constructor(private readonly orderRepository: OrderRepository) {}

  handle = async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case EventType.INVENTORY_RESERVED:
        await this.onInventoryReserved(event);
        break;
      case EventType.PAYMENT_COMPLETED:
        await this.onPaymentCompleted(event);
        break;
      default:
        logger.debug({ type: event.type }, 'Ignoring event');
    }
  };

  private async onInventoryReserved(event: DomainEvent): Promise<void> {
    const { orderId } = event.data as { orderId: string };
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;

    if (order.status !== OrderStatus.CREATED) {
      logger.debug({ orderId, status: order.status }, 'inventory.reserved already applied');
      return;
    }

    order.transitionTo(OrderStatus.INVENTORY_RESERVED);
    order.transitionTo(OrderStatus.PAYMENT_PENDING);
    await this.orderRepository.update(order);
    logger.info({ orderId }, 'Order advanced to PAYMENT_PENDING');
  }

  private async onPaymentCompleted(event: DomainEvent): Promise<void> {
    const { orderId } = event.data as { orderId: string };
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;

    if (order.status === OrderStatus.CONFIRMED) {
      logger.debug({ orderId }, 'payment.completed already applied');
      return;
    }
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      logger.warn({ orderId, status: order.status }, 'payment.completed for non-pending order');
      return;
    }

    order.transitionTo(OrderStatus.CONFIRMED);
    await this.orderRepository.update(order, [orderConfirmedEvent(order)]);
    logger.info({ orderId }, 'Order confirmed, emitted order.confirmed');
  }
}
