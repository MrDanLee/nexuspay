import { createLogger } from '@nexuspay/shared';

import { InventoryRepository } from '../ports/InventoryRepository';
import { ReleaseStockCommand } from '../commands/ReleaseStockCommand';

const logger = createLogger({ service: 'inventory-service', handler: 'ReleaseStockHandler' });

export interface ReleaseStockResult {
  orderId: string;
  releasedCount: number;
}

/**
 * Releases all active reservations for an order.
 *
 * Idempotent by design: if the order has no active reservations (already
 * released, expired, or never reserved) the repository releases nothing
 * and the handler returns a zero count without error. This makes it safe
 * to retry on saga compensation and duplicate cancellation events.
 */
export class ReleaseStockHandler {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async execute(command: ReleaseStockCommand): Promise<ReleaseStockResult> {
    const releasedCount = await this.inventoryRepository.release(command.orderId);

    logger.info(
      { orderId: command.orderId, releasedCount, reason: command.reason },
      releasedCount > 0 ? 'Stock released for order' : 'No active reservations to release',
    );

    return { orderId: command.orderId, releasedCount };
  }
}
