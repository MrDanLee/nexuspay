import { DomainEvent, EventType, createLogger } from '@nexuspay/shared';

import { OrderStatus } from '../../domain/value-objects/OrderStatus';
import { OrderRepository } from '../../application/ports/OrderRepository';
import { SagaStepRepository } from '../../application/ports/SagaStepRepository';
import { orderConfirmedEvent, orderCancelledEvent } from '../../application/events/orderEvents';
import { orderMetrics } from '../../infrastructure/observability/orderMetrics';

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
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly sagaSteps: SagaStepRepository,
  ) {}

  handle = async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case EventType.INVENTORY_RESERVED:
        await this.onInventoryReserved(event);
        break;
      case EventType.PAYMENT_COMPLETED:
        await this.onPaymentCompleted(event);
        break;
      case EventType.PAYMENT_FAILED:
        await this.onPaymentFailed(event);
        break;
      case EventType.INVENTORY_FAILED:
        await this.onInventoryFailed(event);
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
    await this.sagaSteps.record(orderId, 'inventory_reserved', 'COMPLETED');
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
    orderMetrics.recordConfirmed();
    await this.sagaSteps.record(orderId, 'payment_completed', 'COMPLETED');
    logger.info({ orderId }, 'Order confirmed, emitted order.confirmed');
  }

  private async onPaymentFailed(event: DomainEvent): Promise<void> {
    const { orderId } = event.data as { orderId: string };
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;

    if (order.status === OrderStatus.CANCELLED) {
      logger.debug({ orderId }, 'payment.failed already applied');
      return;
    }

    if (order.status === OrderStatus.PAYMENT_PENDING) {
      order.transitionTo(OrderStatus.PAYMENT_FAILED);
    }

    if (!order.isCancellable()) {
      logger.warn({ orderId, status: order.status }, 'payment.failed for non-cancellable order');
      return;
    }

    // Cancelling emits order.cancelled, which releases the reserved stock.
    order.cancel();
    await this.orderRepository.update(order, [orderCancelledEvent(order, 'payment failed')]);
    orderMetrics.recordCancelled('payment_failed');
    await this.sagaSteps.record(orderId, 'payment_failed', 'FAILED', 'payment failed');
    logger.info({ orderId }, 'Order cancelled after payment failure, emitted order.cancelled');
  }

  private async onInventoryFailed(event: DomainEvent): Promise<void> {
    const { orderId } = event.data as { orderId: string };
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;

    if (order.status === OrderStatus.CANCELLED) {
      logger.debug({ orderId }, 'inventory.failed already applied');
      return;
    }

    if (order.status === OrderStatus.CREATED) {
      order.transitionTo(OrderStatus.INVENTORY_FAILED);
    }

    if (!order.isCancellable()) {
      logger.warn({ orderId, status: order.status }, 'inventory.failed for non-cancellable order');
      return;
    }

    // Nothing was reserved, so no compensation event is emitted.
    order.cancel();
    await this.orderRepository.update(order);
    orderMetrics.recordCancelled('inventory_failed');
    await this.sagaSteps.record(orderId, 'inventory_failed', 'FAILED', 'inventory failed');
    logger.info({ orderId }, 'Order cancelled after inventory failure');
  }
}
