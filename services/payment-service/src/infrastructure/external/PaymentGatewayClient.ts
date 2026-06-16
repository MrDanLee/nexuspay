import { randomUUID } from 'node:crypto';

export interface ChargeRequest {
  amount: string;
  currency: string;
  idempotencyKey: string;
}

export interface ChargeResult {
  transactionId: string;
}

export interface RefundRequest {
  transactionId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
}

export interface RefundResult {
  refundId: string;
}

/**
 * Error raised by the simulated gateway.
 *
 * `retryable` distinguishes transient failures (timeouts, 5xx) that are
 * worth retrying from permanent ones (4xx declines). The retry utility
 * and circuit breaker only act on retryable failures.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface GatewayOptions {
  failureRate: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

/**
 * Simulated Stripe-like payment gateway.
 *
 * Adds realistic latency and fails a configurable fraction of requests so
 * the resilience patterns (retry, circuit breaker) can be exercised.
 * Failures are split between transient (retryable 503) and permanent
 * (non-retryable 402 decline). The random source is injectable so tests
 * are deterministic.
 */
export class PaymentGatewayClient {
  constructor(
    private readonly options: GatewayOptions,
    private readonly random: () => number = Math.random,
  ) {}

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    await this.simulateLatency();
    this.maybeFail();
    return { transactionId: `txn_${randomUUID()}` };
  }

  async refund(_request: RefundRequest): Promise<RefundResult> {
    await this.simulateLatency();
    this.maybeFail();
    return { refundId: `rf_${randomUUID()}` };
  }

  private maybeFail(): void {
    const roll = this.random();
    if (roll >= this.options.failureRate) {
      return;
    }
    // Half of the failures are permanent declines, half are transient.
    if (roll < this.options.failureRate / 2) {
      throw new GatewayError('Card declined', false, 402);
    }
    throw new GatewayError('Gateway temporarily unavailable', true, 503);
  }

  private async simulateLatency(): Promise<void> {
    const { minLatencyMs, maxLatencyMs } = this.options;
    if (maxLatencyMs <= 0) return;
    const span = Math.max(0, maxLatencyMs - minLatencyMs);
    const delay = minLatencyMs + Math.floor(this.random() * span);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
