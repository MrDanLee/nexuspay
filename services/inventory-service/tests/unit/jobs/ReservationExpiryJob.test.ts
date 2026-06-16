import {
  InventoryRepository,
  ExpiredReservation,
} from '../../../src/application/ports/InventoryRepository';
import { ReservationExpiryJob } from '../../../src/infrastructure/jobs/ReservationExpiryJob';

const makeRepo = (overrides: Partial<InventoryRepository> = {}): InventoryRepository => ({
  findBySku: jest.fn(),
  findBySkus: jest.fn(),
  reserve: jest.fn(),
  release: jest.fn(),
  releaseExpired: jest.fn(async () => []),
  ...overrides,
});

const expired = (orderId: string): ExpiredReservation => ({
  reservationId: `res-${orderId}`,
  orderId,
  sku: 'SKU-1',
  quantity: 1,
});

describe('ReservationExpiryJob', () => {
  it('releases expired reservations and returns the count', async () => {
    const releaseExpired = jest.fn(async () => [expired('o1'), expired('o2')]);
    const repo = makeRepo({ releaseExpired });
    const job = new ReservationExpiryJob(repo, 60_000);

    const now = new Date('2026-01-01T00:00:00Z');
    const count = await job.runOnce(now);

    expect(count).toBe(2);
    expect(releaseExpired).toHaveBeenCalledWith(now);
  });

  it('returns zero when nothing is expired', async () => {
    const repo = makeRepo({ releaseExpired: jest.fn(async () => []) });
    const job = new ReservationExpiryJob(repo, 60_000);

    expect(await job.runOnce()).toBe(0);
  });

  it('does not run a second sweep while one is in flight', async () => {
    let resolveSweep: () => void = () => undefined;
    const releaseExpired = jest.fn(
      () =>
        new Promise<ExpiredReservation[]>((resolve) => {
          resolveSweep = () => resolve([]);
        }),
    );
    const repo = makeRepo({ releaseExpired });
    const job = new ReservationExpiryJob(repo, 60_000);

    const first = job.runOnce();
    const second = await job.runOnce();

    expect(second).toBe(0);
    expect(releaseExpired).toHaveBeenCalledTimes(1);

    resolveSweep();
    await first;
  });

  it('swallows errors so the timer survives', async () => {
    const repo = makeRepo({
      releaseExpired: jest.fn(async () => {
        throw new Error('db down');
      }),
    });
    const job = new ReservationExpiryJob(repo, 60_000);

    await expect(job.runOnce()).resolves.toBe(0);
  });

  it('start/stop are idempotent and do not throw', () => {
    const repo = makeRepo();
    const job = new ReservationExpiryJob(repo, 60_000);

    expect(() => {
      job.start();
      job.start();
      job.stop();
      job.stop();
    }).not.toThrow();
  });
});
