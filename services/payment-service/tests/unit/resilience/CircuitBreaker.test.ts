import {
  CircuitBreaker,
  CircuitOpenError,
  StateChange,
} from '../../../src/infrastructure/resilience/CircuitBreaker';

describe('CircuitBreaker', () => {
  let current: number;
  const now = () => current;
  const ok = () => Promise.resolve('ok');
  const fail = () => Promise.reject(new Error('boom'));

  beforeEach(() => {
    current = 1000;
  });

  const tripOpen = async (breaker: CircuitBreaker, threshold: number) => {
    for (let i = 0; i < threshold; i += 1) {
      await expect(breaker.execute(fail)).rejects.toThrow('boom');
    }
  };

  it('opens after the failure threshold is reached', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5000, now });
    await tripOpen(breaker, 3);
    expect(breaker.getState()).toBe('OPEN');
  });

  it('fails fast without calling fn while open', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5000, now });
    await tripOpen(breaker, 2);

    const fn = jest.fn(ok);
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('moves to half-open and closes on a successful probe', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5000, now });
    await tripOpen(breaker, 2);

    current += 5000; // reset timeout elapsed
    await expect(breaker.execute(ok)).resolves.toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });

  it('re-opens when the probe fails', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5000, now });
    await tripOpen(breaker, 2);

    current += 5000;
    await expect(breaker.execute(fail)).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('OPEN');
  });

  it('resets the failure count on success while closed', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5000, now });
    await expect(breaker.execute(fail)).rejects.toThrow('boom');
    await expect(breaker.execute(fail)).rejects.toThrow('boom');
    await breaker.execute(ok);
    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('reports state transitions via onStateChange', async () => {
    const changes: StateChange[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 5000,
      now,
      onStateChange: (c) => changes.push(c),
    });

    await tripOpen(breaker, 2);
    current += 5000;
    await breaker.execute(ok);

    expect(changes).toEqual([
      { from: 'CLOSED', to: 'OPEN' },
      { from: 'OPEN', to: 'HALF_OPEN' },
      { from: 'HALF_OPEN', to: 'CLOSED' },
    ]);
  });

  it('ignores failures rejected by shouldCount', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 5000,
      now,
      shouldCount: (error) => (error as Error).message !== 'ignore-me',
    });

    const ignored = () => Promise.reject(new Error('ignore-me'));
    await expect(breaker.execute(ignored)).rejects.toThrow('ignore-me');
    await expect(breaker.execute(ignored)).rejects.toThrow('ignore-me');
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.getFailureCount()).toBe(0);
  });
});
