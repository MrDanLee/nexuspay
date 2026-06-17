import {
  createLogger,
  retry,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
} from '@nexuspay/shared';

import { Payment } from '../../domain/entities/Payment';
import { PaymentStatus } from '../../domain/value-objects/PaymentStatus';
import {
  PaymentGatewayClient,
  isRetryableGatewayError,
} from '../../infrastructure/external/PaymentGatewayClient';
import { RefundCommand } from '../commands/RefundCommand';
import { PaymentRepository } from '../ports/PaymentRepository';
import { RefundRepository, RefundRecord } from '../ports/RefundRepository';

const logger = createLogger({ service: 'payment-service', handler: 'RefundHandler' });

export interface RefundResult {
  payment: Payment;
  refund: RefundRecord;
}

export interface RefundRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Refunds a completed payment.
 *
 * Idempotent: a duplicate refund idempotency key returns the existing
 * refund. The payment stays COMPLETED until the gateway confirms the
 * refund, so a gateway failure leaves it cleanly retryable instead of
 * stuck in REFUND_PENDING.
 */
export class RefundHandler {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly refundRepository: RefundRepository,
    private readonly gateway: PaymentGatewayClient,
    private readonly retryConfig: RefundRetryConfig = { maxAttempts: 3, baseDelayMs: 100 },
  ) {}

  async execute(command: RefundCommand): Promise<RefundResult> {
    const existingRefund = await this.refundRepository.findByIdempotencyKey(
      command.idempotencyKey,
    );
    if (existingRefund) {
      const payment = await this.paymentRepository.findById(existingRefund.paymentId);
      if (!payment) {
        throw new NotFoundError(`Payment ${existingRefund.paymentId} not found`);
      }
      logger.info(
        { paymentId: payment.id, refundId: existingRefund.id },
        'Returning existing refund (idempotent request)',
      );
      return { payment, refund: existingRefund };
    }

    const payment = await this.paymentRepository.findById(command.paymentId);
    if (!payment) {
      throw new NotFoundError(`Payment ${command.paymentId} not found`, {
        instance: `/api/v1/payments/${command.paymentId}/refund`,
      });
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new ConflictError(
        `Only completed payments can be refunded (current status: ${payment.status})`,
        { metadata: { paymentId: payment.id, status: payment.status } },
      );
    }

    let gatewayRefundId: string;
    try {
      const result = await retry(
        () =>
          this.gateway.refund({
            transactionId: payment.gatewayTransactionId as string,
            amount: payment.amount.toFixed(),
            currency: payment.amount.currency,
            idempotencyKey: command.idempotencyKey,
          }),
        {
          maxAttempts: this.retryConfig.maxAttempts,
          baseDelayMs: this.retryConfig.baseDelayMs,
          sleep: this.retryConfig.sleep,
          isRetryable: isRetryableGatewayError,
        },
      );
      gatewayRefundId = result.refundId;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown gateway error';
      logger.warn({ paymentId: payment.id, reason }, 'Refund failed at gateway');
      throw new ExternalServiceError(`Refund failed: ${reason}`);
    }

    // Gateway confirmed: advance the payment to REFUNDED and record it.
    payment.requestRefund();
    payment.markRefunded(gatewayRefundId);
    await this.paymentRepository.update(payment);

    const refund = await this.refundRepository.save({
      paymentId: payment.id as string,
      amount: payment.amount.toFixed(),
      currency: payment.amount.currency,
      status: 'COMPLETED',
      gatewayRefundId,
      idempotencyKey: command.idempotencyKey,
      reason: command.reason,
    });

    logger.info({ paymentId: payment.id, refundId: refund.id }, 'Payment refunded');
    return { payment, refund };
  }
}
