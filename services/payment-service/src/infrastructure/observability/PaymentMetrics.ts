import { MetricNames } from '@nexuspay/shared';

import { CircuitState } from '../resilience/CircuitBreaker';

/**
 * Lightweight in-process metrics for the payment service.
 *
 * Exposes payment success/failure counters and the circuit-breaker state
 * in Prometheus text format. Replaced/augmented by the shared Prometheus
 * registry in the observability phase, but useful standalone for the
 * /metrics endpoint today.
 */
export class PaymentMetrics {
  private paymentsSucceeded = 0;
  private paymentsFailed = 0;
  private circuitState: CircuitState = 'CLOSED';

  recordPaymentResult(success: boolean): void {
    if (success) {
      this.paymentsSucceeded += 1;
    } else {
      this.paymentsFailed += 1;
    }
  }

  setCircuitState(state: CircuitState): void {
    this.circuitState = state;
  }

  snapshot(): {
    paymentsSucceeded: number;
    paymentsFailed: number;
    circuitState: CircuitState;
  } {
    return {
      paymentsSucceeded: this.paymentsSucceeded,
      paymentsFailed: this.paymentsFailed,
      circuitState: this.circuitState,
    };
  }

  renderPrometheus(): string {
    const stateValue =
      this.circuitState === 'CLOSED' ? 0 : this.circuitState === 'HALF_OPEN' ? 1 : 2;

    const succeeded = MetricNames.PAYMENT_SUCCEEDED_TOTAL;
    const failed = MetricNames.PAYMENT_FAILED_TOTAL;
    const circuit = MetricNames.PAYMENT_CIRCUIT_BREAKER_STATE;

    return [
      `# HELP ${succeeded} Total number of successful payments`,
      `# TYPE ${succeeded} counter`,
      `${succeeded} ${this.paymentsSucceeded}`,
      `# HELP ${failed} Total number of failed payments`,
      `# TYPE ${failed} counter`,
      `${failed} ${this.paymentsFailed}`,
      `# HELP ${circuit} Circuit breaker state (0=closed, 1=half_open, 2=open)`,
      `# TYPE ${circuit} gauge`,
      `${circuit} ${stateValue}`,
      '',
    ].join('\n');
  }
}
