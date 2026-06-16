import { NotFoundError } from '@nexuspay/shared';

import { OrderRepository } from '../ports/OrderRepository';
import { SagaStepRepository, SagaStep } from '../ports/SagaStepRepository';

export interface OrderTimeline {
  orderId: string;
  status: string;
  steps: SagaStep[];
}

/**
 * Builds the chronological saga timeline for an order: its current status
 * plus every recorded saga step (with timing and retry counts). Useful for
 * debugging failed sagas and for customer support. Ownership is enforced —
 * a customer only sees their own order's timeline.
 */
export class GetTimelineHandler {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly sagaStepRepository: SagaStepRepository,
  ) {}

  async execute(orderId: string, customerId: string): Promise<OrderTimeline> {
    const order = await this.orderRepository.findById(orderId);
    if (!order || order.customerId !== customerId) {
      throw new NotFoundError(`Order ${orderId} not found`, {
        instance: `/api/v1/orders/${orderId}/timeline`,
      });
    }

    const steps = await this.sagaStepRepository.findByOrderId(orderId);
    return { orderId, status: order.status, steps };
  }
}
