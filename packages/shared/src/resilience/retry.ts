export interface RetryAttemptInfo {
  /** 1-based index of the attempt that just failed. */
  attempt: number;
  /** Delay before the next attempt, in milliseconds. */
  delayMs: number;
  /** The error that triggered the retry. */
  error: unknown;
}

export interface RetryOptions {
  /** Maximum number of attempts, including the first (default 3). */
  maxAttempts?: number;
  /** Base delay for the exponential backoff, in milliseconds (default 100). */
  baseDelayMs?: number;
  /** Upper bound for any single backoff delay (default 30_000). */
  maxDelayMs?: number;
  /** Apply full jitter to spread out retries (default true). */
  jitter?: boolean;
  /**
   * Decide whether an error is worth retrying. Non-retryable errors (4xx
   * declines, an open circuit breaker) are rethrown immediately. Defaults
   * to retrying everything.
   */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each backoff sleep, e.g. to log the retry. */
  onRetry?: (info: RetryAttemptInfo) => void;
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable randomness for deterministic jitter in tests. */
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async operation with exponential backoff and full jitter.
 *
 * The delay for attempt N is `min(baseDelay * 2^(N-1), maxDelay)`, then
 * jittered to a random value in `[0, delay]` to avoid thundering herds.
 * Retrying stops as soon as `isRetryable` returns false, which is how the
 * caller respects circuit-breaker state and non-retryable gateway errors.
 *
 * @throws the last error once attempts are exhausted or the error is
 *   classified as non-retryable.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const jitter = options.jitter ?? true;
  const isRetryable = options.isRetryable ?? (() => true);
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const exponential = baseDelayMs * 2 ** (attempt - 1);
      const capped = Math.min(exponential, maxDelayMs);
      const delayMs = jitter ? Math.floor(random() * capped) : capped;

      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw lastError;
}
