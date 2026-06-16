import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  requestId: string;
  correlationId: string;
  userId?: string;
  startTime: number;
  /** W3C trace id (32 hex chars) for distributed tracing. */
  traceId?: string;
  /** W3C span id (16 hex chars) for the current hop. */
  spanId?: string;
}

/**
 * Request-scoped context using AsyncLocalStorage.
 *
 * AsyncLocalStorage provides context that follows the async call chain
 * without needing to pass it through every function parameter. This is
 * how we propagate requestId, correlationId, and userId across the
 * entire request lifecycle — including into the logger.
 *
 * Usage:
 *   // In middleware (set context)
 *   RequestContext.run({ requestId: 'abc', correlationId: 'xyz', startTime: Date.now() }, next);
 *
 *   // Anywhere downstream (read context)
 *   const ctx = RequestContext.get();
 *   console.log(ctx?.requestId); // 'abc'
 */
export class RequestContext {
  private static storage = new AsyncLocalStorage<RequestContextData>();

  /**
   * Run a function within a request context.
   * All async operations within the callback will have access to this context.
   */
  static run<T>(context: RequestContextData, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /**
   * Get the current request context.
   * Returns undefined if called outside a request context.
   */
  static get(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  /**
   * Get a specific field from the current context.
   * Returns undefined if no context or field not set.
   */
  static getRequestId(): string | undefined {
    return this.get()?.requestId;
  }

  static getCorrelationId(): string | undefined {
    return this.get()?.correlationId;
  }

  static getUserId(): string | undefined {
    return this.get()?.userId;
  }

  static getTraceId(): string | undefined {
    return this.get()?.traceId;
  }

  static getSpanId(): string | undefined {
    return this.get()?.spanId;
  }

  /**
   * Get elapsed time since request started in milliseconds.
   */
  static getElapsedMs(): number | undefined {
    const ctx = this.get();
    return ctx ? Date.now() - ctx.startTime : undefined;
  }
}