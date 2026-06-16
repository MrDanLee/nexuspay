import { Inventory } from '../../domain/entities/Inventory';

export interface ReservationItem {
  sku: string;
  quantity: number;
}

export interface ReservationResult {
  sku: string;
  quantity: number;
  reservationId: string;
}

export interface ExpiredReservation {
  reservationId: string;
  orderId: string;
  sku: string;
  quantity: number;
}

/**
 * Port for inventory persistence.
 *
 * The application layer defines this interface; the infrastructure layer
 * implements it against PostgreSQL. Reserve/release are atomic, all-or-
 * nothing operations so the saga never observes partial stock changes.
 */
export interface InventoryRepository {
  /** Look up the stock record for a single SKU. */
  findBySku(sku: string): Promise<Inventory | null>;

  /** Bulk look up stock records for many SKUs (order preserved by caller). */
  findBySkus(skus: string[]): Promise<Inventory[]>;

  /**
   * Atomically reserve every item for an order under row locks.
   * If any line fails (unknown SKU or insufficient stock) the whole
   * operation rolls back and no reservation is recorded.
   */
  reserve(
    orderId: string,
    items: ReservationItem[],
    expiresAt: Date,
  ): Promise<ReservationResult[]>;

  /**
   * Release all active reservations for an order and return the count.
   * Idempotent: releasing an order with no active reservations is a no-op.
   */
  release(orderId: string): Promise<number>;

  /**
   * Release reservations whose expires_at has passed and return them.
   */
  releaseExpired(now: Date): Promise<ExpiredReservation[]>;
}
