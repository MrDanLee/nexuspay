export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface StateChange {
  from: CircuitState;
  to: CircuitState;
}

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker open. */
  failureThreshold: number;
  /** How long to stay open before allowing a probe (ms). */
  resetTimeoutMs: number;
  /** Notified on every state transition (for metrics/monitoring). */
  onStateChange?: (change: StateChange) => void;
  /** Whether a thrown error should count as a failure (default: all). */
  shouldCount?: (error: unknown) => boolean;
  /** Clock injection for deterministic tests. */
  now?: () => number;
}

/**
 * Error thrown when a call is rejected because the breaker is open.
 */
export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker for an unreliable dependency (the payment gateway).
 *
 *   CLOSED ──(threshold failures)──▶ OPEN
 *   OPEN ──(after resetTimeout)──▶ HALF_OPEN
 *   HALF_OPEN ──(probe succeeds)──▶ CLOSED
 *   HALF_OPEN ──(probe fails)─────▶ OPEN
 *
 * While OPEN, calls fail fast with CircuitOpenError instead of hammering
 * a struggling dependency. A single probe in HALF_OPEN decides whether to
 * close again or re-open.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private nextProbeAt = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: (change: StateChange) => void;
  private readonly shouldCount: (error: unknown) => boolean;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
    this.onStateChange = options.onStateChange;
    this.shouldCount = options.shouldCount ?? (() => true);
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Run `fn` through the breaker.
   * @throws CircuitOpenError when the breaker is open and not yet probing
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.now() < this.nextProbeAt) {
        throw new CircuitOpenError();
      }
      this.transition('HALF_OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.transition('CLOSED');
    }
  }

  private onFailure(error: unknown): void {
    if (!this.shouldCount(error)) {
      return;
    }

    this.failureCount += 1;

    if (this.state === 'HALF_OPEN') {
      this.open();
    } else if (this.failureCount >= this.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.nextProbeAt = this.now() + this.resetTimeoutMs;
    this.transition('OPEN');
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    this.onStateChange?.({ from, to });
  }
}
