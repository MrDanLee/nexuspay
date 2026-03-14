import { NotFoundError } from '@nexuspay/shared';

import { Order } from '../../domain/entities/Order';
import { OrderRepository } from '../ports/OrderRepository';

/**
 * Query handler for retrieving a single order by ID.
 */
export class GetOrderHandler {
  constructor(private readonly orderRepository: OrderRepository) { }

  async execute(orderId: string, customerId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundError(`Order ${orderId} not found`, {
        instance: `/api/v1/orders/${orderId}`,
      });
    }

    // Ensure customer can only see their own orders
    if (order.customerId !== customerId) {
      throw new NotFoundError(`Order ${orderId} not found`, {
        instance: `/api/v1/orders/${orderId}`,
      });
    }

    return order;
  }
}