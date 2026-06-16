import { retry } from '../../../src/resilience/retry';

describe('retry', () => {
  const noSleep = async (): Promise<void> => undefined;

  it('returns the result without retrying on success', async () => {
    const fn = jest.fn(async () => 'ok');
    const result = await retry(fn, { maxAttempts: 3, sleep: noSleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxAttempts then throws the last error', async () => {
    const fn = jest.fn(async () => {
      throw new Error('always fails');
    });

    await expect(
      retry(fn, { maxAttempts: 4, baseDelayMs: 10, sleep: noSleep }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('succeeds on a later attempt', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return 'recovered';
    });

    const result = await retry(fn, { maxAttempts: 5, sleep: noSleep });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = jest.fn(async () => {
      throw new Error('permanent');
    });

    await expect(
      retry(fn, { maxAttempts: 5, sleep: noSleep, isRetryable: () => false }),
    ).rejects.toThrow('permanent');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially (no jitter)', async () => {
    const delays: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      delays.push(ms);
    };
    const fn = async (): Promise<never> => {
      throw new Error('fail');
    };

    await expect(
      retry(fn, { maxAttempts: 4, baseDelayMs: 100, jitter: false, sleep }),
    ).rejects.toThrow('fail');

    expect(delays).toEqual([100, 200, 400]);
  });

  it('caps the delay at maxDelayMs', async () => {
    const delays: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      delays.push(ms);
    };
    const fn = async (): Promise<never> => {
      throw new Error('fail');
    };

    await expect(
      retry(fn, {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 1500,
        jitter: false,
        sleep,
      }),
    ).rejects.toThrow('fail');

    expect(delays).toEqual([1000, 1500, 1500]);
  });

  it('applies jitter using the injected randomness', async () => {
    const delays: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      delays.push(ms);
    };
    const fn = async (): Promise<never> => {
      throw new Error('fail');
    };

    await expect(
      retry(fn, {
        maxAttempts: 2,
        baseDelayMs: 100,
        jitter: true,
        random: () => 0.5,
        sleep,
      }),
    ).rejects.toThrow('fail');

    expect(delays).toEqual([50]); // floor(0.5 * 100)
  });

  it('reports each retry through onRetry', async () => {
    const attempts: number[] = [];
    const fn = async (): Promise<never> => {
      throw new Error('fail');
    };

    await expect(
      retry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        jitter: false,
        sleep: noSleep,
        onRetry: (info) => attempts.push(info.attempt),
      }),
    ).rejects.toThrow('fail');

    expect(attempts).toEqual([1, 2]);
  });
});
