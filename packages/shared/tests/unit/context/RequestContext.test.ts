import { RequestContext, RequestContextData } from '../../../src/context/RequestContext';

describe('RequestContext', () => {
  const createContext = (overrides: Partial<RequestContextData> = {}): RequestContextData => ({
    requestId: 'req-123',
    correlationId: 'cor-456',
    startTime: Date.now(),
    ...overrides,
  });

  it('should return undefined when accessed outside a context', () => {
    expect(RequestContext.get()).toBeUndefined();
    expect(RequestContext.getRequestId()).toBeUndefined();
    expect(RequestContext.getCorrelationId()).toBeUndefined();
    expect(RequestContext.getUserId()).toBeUndefined();
  });

  it('should provide context within run callback', () => {
    const ctx = createContext({ userId: 'user-789' });

    RequestContext.run(ctx, () => {
      expect(RequestContext.get()).toEqual(ctx);
      expect(RequestContext.getRequestId()).toBe('req-123');
      expect(RequestContext.getCorrelationId()).toBe('cor-456');
      expect(RequestContext.getUserId()).toBe('user-789');
    });
  });

  it('should isolate context between concurrent async operations', async () => {
    const results: string[] = [];

    const operation = (id: string, delay: number): Promise<void> => {
      const ctx = createContext({ requestId: id });
      return new Promise((resolve) => {
        RequestContext.run(ctx, () => {
          setTimeout(() => {
            const currentId = RequestContext.getRequestId();
            results.push(currentId ?? 'undefined');
            resolve();
          }, delay);
        });
      });
    };

    await Promise.all([
      operation('request-A', 20),
      operation('request-B', 10),
    ]);

    expect(results).toContain('request-A');
    expect(results).toContain('request-B');
    expect(results).toHaveLength(2);
  });

  it('should return undefined for userId when not set', () => {
    const ctx = createContext();

    RequestContext.run(ctx, () => {
      expect(RequestContext.getUserId()).toBeUndefined();
    });
  });

  it('should track elapsed time since request start', async () => {
    const ctx = createContext({ startTime: Date.now() - 100 });

    RequestContext.run(ctx, () => {
      const elapsed = RequestContext.getElapsedMs();
      expect(elapsed).toBeDefined();
      expect(elapsed!).toBeGreaterThanOrEqual(99);
    });
  });

  it('should return undefined for elapsed time outside context', () => {
    expect(RequestContext.getElapsedMs()).toBeUndefined();
  });
});