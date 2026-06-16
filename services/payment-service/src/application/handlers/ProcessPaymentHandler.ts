import { createLogger, retry, Money } from '@nexuspay/shared';

import { Payment } from '../../domain/entities/Payment';
import { PaymentStatus } from '../../domain/value-objects/PaymentStatus';
import {
  PaymentGatewayClient,
  GatewayError,
} from '../../infrastructure/external/PaymentGatewayClient';
import {
  CircuitBreaker,
  CircuitOpenError,
} from '../../infrastructure/resilience/CircuitBreaker';
import { PaymentMetrics } from '../../infrastructure/observability/PaymentMetrics';
import { PaymentRepository } from '../ports/PaymentRepository';
import { ProcessPaymentCommand } from '../commands/ProcessPaymentCommand';

const logger = createLogger({ service: 'payment-service', handler: 'ProcessPaymentHandler' });

export interface ProcessPaymentResult {
  payment: Payment;
  success: boolean;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Processes a payment for an order.
 *
 * Wraps the gateway call in a circuit breaker and a retry-with-backoff so
 * transient gateway failures are absorbed while a struggling gateway is
 * protected from a thundering herd. Idempotent: a duplicate idempotency
 * key returns the existing payment without charging again. Every state
 * change is persisted (and its events appended) so the timeline survives.
 */
export class ProcessPaymentHandler {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly gateway: PaymentGatewayClient,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly retryConfig: RetryConfig = { maxAttempts: 3, baseDelayMs: 100 },
    private readonly metrics?: PaymentMetrics,
  ) {}

  async execute(command: ProcessPaymentCommand): Promise<ProcessPaymentResult> {
    const existing = await this.paymentRepository.findByIdempotencyKey(command.idempotencyKey);
    if (existing) {
      logger.info(
        { orderId: command.orderId, paymentId: existing.id },
        'Returning existing payment (idempotent request)',
      );
      return { payment: existing, success: existing.status === PaymentStatus.COMPLETED };
    }

    let payment = new Payment({
      orderId: command.orderId,
      customerId: command.customerId,
      amount: Money.of(command.amount, command.currency),
      idempotencyKey: command.idempotencyKey,
    });
    payment = await this.paymentRepository.save(payment);

    payment.markProcessing();
    payment = await this.paymentRepository.update(payment);

    try {
      const result = await this.circuitBreaker.execute(() =>
        retry(
          () =>
            this.gateway.charge({
              amount: payment.amount.toFixed(),
              currency: payment.amount.currency,
              idempotencyKey: command.idempotencyKey,
            }),
          {
            maxAttempts: this.retryConfig.maxAttempts,
            baseDelayMs: this.retryConfig.baseDelayMs,
            sleep: this.retryConfig.sleep,
            isRetryable: (error) => error instanceof GatewayError && error.retryable,
            onRetry: (info) =>
              logger.warn(
                { orderId: command.orderId, attempt: info.attempt, delayMs: info.delayMs },
                'Retrying gateway charge',
              ),
          },
        ),
      );

      payment.markCompleted(result.transactionId);
      payment = await this.paymentRepository.update(payment);
      this.metrics?.recordPaymentResult(true);
      logger.info({ orderId: command.orderId, paymentId: payment.id }, 'Payment completed');
      return { payment, success: true };
    } catch (error) {
      const reason =
        error instanceof CircuitOpenError
          ? 'circuit_open'
          : error instanceof Error
            ? error.message
            : 'unknown gateway error';

      payment.markFailed(reason);
      payment = await this.paymentRepository.update(payment);
      this.metrics?.recordPaymentResult(false);
      logger.warn({ orderId: command.orderId, paymentId: payment.id, reason }, 'Payment failed');
      return { payment, success: false };
    }
  }
}
