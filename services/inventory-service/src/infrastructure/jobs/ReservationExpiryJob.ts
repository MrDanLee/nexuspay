import { createLogger } from '@nexuspay/shared';

import { InventoryRepository } from '../../application/ports/InventoryRepository';

const logger = createLogger({ service: 'inventory-service', job: 'ReservationExpiryJob' });

/**
 * Background job that releases reservations past their expiry.
 *
 * Abandoned orders (created but never confirmed) would otherwise hold
 * stock forever. This sweeper runs on a fixed interval and returns
 * expired reservations to available stock. A reentrancy guard ensures a
 * slow sweep never overlaps with the next tick.
 */
export class ReservationExpiryJob {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly intervalMs: number,
  ) {}

  /** Start the periodic sweep. No-op if already started. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    // Don't keep the event loop alive just for the sweeper.
    this.timer.unref();
    logger.info({ intervalMs: this.intervalMs }, 'Reservation expiry job started');
  }

  /** Stop the periodic sweep. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Reservation expiry job stopped');
    }
  }

  /**
   * Run a single expiry sweep. Returns the number of reservations
   * released. Errors are logged and swallowed so a transient failure
   * does not crash the timer.
   */
  async runOnce(now: Date = new Date()): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;

    try {
      const released = await this.inventoryRepository.releaseExpired(now);
      if (released.length > 0) {
        logger.info(
          {
            count: released.length,
            orders: [...new Set(released.map((r) => r.orderId))],
          },
          'Released expired reservations',
        );
      }
      return released.length;
    } catch (error) {
      logger.error({ err: error }, 'Reservation expiry sweep failed');
      return 0;
    } finally {
      this.running = false;
    }
  }
}
