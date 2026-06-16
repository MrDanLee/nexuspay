import { createLogger } from '@nexuspay/shared';

import { PaymentStatus } from '../../domain/value-objects/PaymentStatus';
import { PaymentRepository } from '../ports/PaymentRepository';

const logger = createLogger({ service: 'payment-service', handler: 'ProcessWebhookHandler' });

export interface PaymentWebhookEvent {
  id: string;
  type: string;
  data: {
    paymentId: string;
    gatewayTransactionId?: string;
    reason?: string;
  };
}

export interface WebhookResult {
  applied: boolean;
  status?: PaymentStatus;
}

/**
 * Applies a verified gateway webhook to the corresponding payment.
 *
 * Idempotent: a redelivered event whose effect is already reflected in
 * the payment's status is a no-op. Only payments still in PROCESSING are
 * advanced, so duplicate "succeeded"/"failed" callbacks never double-apply
 * and out-of-order deliveries can't move a terminal payment.
 */
export class ProcessWebhookHandler {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  async execute(event: PaymentWebhookEvent): Promise<WebhookResult> {
    const payment = await this.paymentRepository.findById(event.data.paymentId);
    if (!payment) {
      logger.warn({ eventId: event.id, paymentId: event.data.paymentId }, 'Webhook for unknown payment, ignoring');
      return { applied: false };
    }

    switch (event.type) {
      case 'payment.succeeded': {
        if (payment.status !== PaymentStatus.PROCESSING) {
          return { applied: false, status: payment.status };
        }
        payment.markCompleted(event.data.gatewayTransactionId ?? 'webhook');
        await this.paymentRepository.update(payment);
        logger.info({ eventId: event.id, paymentId: payment.id }, 'Payment completed via webhook');
        return { applied: true, status: payment.status };
      }

      case 'payment.failed': {
        if (payment.status !== PaymentStatus.PROCESSING) {
          return { applied: false, status: payment.status };
        }
        payment.markFailed(event.data.reason ?? 'gateway reported failure');
        await this.paymentRepository.update(payment);
        logger.info({ eventId: event.id, paymentId: payment.id }, 'Payment failed via webhook');
        return { applied: true, status: payment.status };
      }

      default:
        logger.warn({ eventId: event.id, type: event.type }, 'Unknown webhook event type, ignoring');
        return { applied: false, status: payment.status };
    }
  }
}
