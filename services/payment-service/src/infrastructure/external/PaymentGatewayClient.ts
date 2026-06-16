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

/**
 * Whether a gateway failure is worth retrying.
 *
 * 5xx responses and timeouts are transient (retry); 4xx responses (e.g. a
 * 402 card decline) are permanent (do not retry). Used by both the retry
 * helper and the circuit breaker so timeouts never count as a hard decline.
 */
export function isRetryableGatewayError(error: unknown): boolean {
  return error instanceof GatewayError && (error.retryable || error.statusCode >= 500);
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
    // Distribute failures: ~40% permanent declines (4xx), ~30% transient
    // 5xx, ~30% timeouts (504). Timeouts are retryable like 5xx.
    const band = roll / this.options.failureRate;
    if (band < 0.4) {
      throw new GatewayError('Card declined', false, 402);
    }
    if (band < 0.7) {
      throw new GatewayError('Gateway temporarily unavailable', true, 503);
    }
    throw new GatewayError('Gateway timeout', true, 504);
  }

  private async simulateLatency(): Promise<void> {
    const { minLatencyMs, maxLatencyMs } = this.options;
    if (maxLatencyMs <= 0) return;
    const span = Math.max(0, maxLatencyMs - minLatencyMs);
    const delay = minLatencyMs + Math.floor(this.random() * span);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
