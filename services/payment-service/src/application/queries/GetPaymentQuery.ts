import { NotFoundError } from '@nexuspay/shared';

import { Payment } from '../../domain/entities/Payment';
import { PaymentRepository } from '../ports/PaymentRepository';

/**
 * Query handler that retrieves the payment for an order.
 */
export class GetPaymentHandler {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  async execute(orderId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment) {
      throw new NotFoundError(`Payment for order ${orderId} not found`, {
        instance: `/api/v1/payments/${orderId}`,
      });
    }
    return payment;
  }
}
