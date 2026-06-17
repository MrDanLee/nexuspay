import { createLogger } from '@nexuspay/shared';

import { config } from '../../config';
import { ReserveStockCommand } from '../commands/ReserveStockCommand';
import { InventoryRepository, ReservationResult } from '../ports/InventoryRepository';

const logger = createLogger({ service: 'inventory-service', handler: 'ReserveStockHandler' });

export interface ReserveStockResult {
  orderId: string;
  reservations: ReservationResult[];
}

/**
 * Reserves stock for every item in an order.
 *
 * The repository performs the reservation atomically: if any line cannot
 * be satisfied, nothing is reserved and the underlying ConflictError
 * propagates. Reservations are created with a TTL so abandoned orders
 * release their stock automatically via the expiry sweeper.
 */
export class ReserveStockHandler {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly ttlSeconds: number = config.RESERVATION_TTL_SECONDS,
  ) {}

  async execute(command: ReserveStockCommand): Promise<ReserveStockResult> {
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const reservations = await this.inventoryRepository.reserve(
      command.orderId,
      command.items,
      expiresAt,
    );

    logger.info(
      {
        orderId: command.orderId,
        reservationCount: reservations.length,
        skus: reservations.map((r) => r.sku),
      },
      'Stock reserved for order',
    );

    return { orderId: command.orderId, reservations };
  }
}
