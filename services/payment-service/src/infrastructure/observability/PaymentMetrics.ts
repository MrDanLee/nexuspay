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

    return [
      '# HELP payment_succeeded_total Total number of successful payments',
      '# TYPE payment_succeeded_total counter',
      `payment_succeeded_total ${this.paymentsSucceeded}`,
      '# HELP payment_failed_total Total number of failed payments',
      '# TYPE payment_failed_total counter',
      `payment_failed_total ${this.paymentsFailed}`,
      '# HELP payment_circuit_breaker_state Circuit breaker state (0=closed, 1=half_open, 2=open)',
      '# TYPE payment_circuit_breaker_state gauge',
      `payment_circuit_breaker_state ${stateValue}`,
      '',
    ].join('\n');
  }
}
