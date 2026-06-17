import { NotFoundError, createLogger } from '@nexuspay/shared';

import { Order } from '../../domain/entities/Order';
import { orderMetrics } from '../../infrastructure/observability/orderMetrics';
import { CancelOrderCommand } from '../commands/CancelOrderCommand';
import { orderCancelledEvent } from '../events/orderEvents';
import { OrderRepository } from '../ports/OrderRepository';

const logger = createLogger({ service: 'order-service', handler: 'CancelOrderHandler' });

/**
 * Handles order cancellation.
 *
 * Validates ownership and cancellability before transitioning
 * the order to CANCELLED status. The domain entity enforces
 * the state machine rules.
 */
export class CancelOrderHandler {
  constructor(private readonly orderRepository: OrderRepository) { }

  async execute(command: CancelOrderCommand): Promise<Order> {
    const order = await this.orderRepository.findById(command.orderId);

    if (!order) {
      throw new NotFoundError(`Order ${command.orderId} not found`, {
        instance: `/api/v1/orders/${command.orderId}`,
      });
    }

    // Verify ownership
    if (order.customerId !== command.customerId) {
      throw new NotFoundError(`Order ${command.orderId} not found`, {
        instance: `/api/v1/orders/${command.orderId}`,
      });
    }

    // Domain entity validates the transition
    order.cancel();

    // Persist the cancellation and emit OrderCancelled atomically (outbox).
    const reason = command.reason ?? 'cancelled by customer';
    const updated = await this.orderRepository.update(order, [
      orderCancelledEvent(order, reason),
    ]);
    orderMetrics.recordCancelled('customer');

    logger.info(
      {
        orderId: updated.id,
        reason: command.reason,
        previousStatus: 'see saga steps',
      },
      'Order cancelled',
    );

    return updated;
  }
}