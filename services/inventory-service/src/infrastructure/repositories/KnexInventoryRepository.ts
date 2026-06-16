import { Knex } from 'knex';
import { NotFoundError } from '@nexuspay/shared';

import { Inventory } from '../../domain/entities/Inventory';
import {
  InventoryRepository,
  ReservationItem,
  ReservationResult,
  ExpiredReservation,
} from '../../application/ports/InventoryRepository';

interface InventoryRow {
  id: string;
  product_id: string;
  sku: string;
  available_qty: number;
  reserved_qty: number;
  version: number;
  updated_at: Date;
}

interface ReservationRow {
  id: string;
  order_id: string;
  sku: string;
  quantity: number;
  status: string;
  expires_at: Date;
  created_at: Date;
  released_at: Date | null;
}

/**
 * PostgreSQL implementation of InventoryRepository using Knex.
 *
 * Concurrency strategy:
 * - reserve/release lock the affected inventory rows with SELECT ... FOR
 *   UPDATE inside a transaction. Rows are locked in SKU order to avoid
 *   deadlocks between transactions touching the same set of SKUs.
 * - The domain entity enforces the non-negative invariants; a thrown
 *   ConflictError rolls the whole transaction back, guaranteeing
 *   all-or-nothing semantics and preventing overselling.
 */
export class KnexInventoryRepository implements InventoryRepository {
  constructor(private readonly db: Knex) {}

  async findBySku(sku: string): Promise<Inventory | null> {
    const row = await this.db<InventoryRow>('inventory').where({ sku }).first();
    return row ? this.toDomain(row) : null;
  }

  async findBySkus(skus: string[]): Promise<Inventory[]> {
    if (skus.length === 0) return [];
    const rows = await this.db<InventoryRow>('inventory').whereIn('sku', skus);
    return rows.map((row) => this.toDomain(row));
  }

  async reserve(
    orderId: string,
    items: ReservationItem[],
    expiresAt: Date,
  ): Promise<ReservationResult[]> {
    const ordered = [...items].sort((a, b) => a.sku.localeCompare(b.sku));

    return this.db.transaction(async (trx) => {
      const results: ReservationResult[] = [];

      for (const item of ordered) {
        const row = await trx<InventoryRow>('inventory')
          .where({ sku: item.sku })
          .forUpdate()
          .first();

        if (!row) {
          throw new NotFoundError(`Unknown SKU ${item.sku}`, {
            metadata: { sku: item.sku },
          });
        }

        const inventory = this.toDomain(row);
        // Throws ConflictError on insufficient stock -> rolls back the txn.
        inventory.reserve(item.quantity);

        await trx<InventoryRow>('inventory')
          .where({ id: row.id })
          .update({
            available_qty: inventory.availableQty,
            reserved_qty: inventory.reservedQty,
            version: inventory.version,
            updated_at: new Date(),
          });

        const [reservation] = await trx<ReservationRow>('reservations')
          .insert({
            order_id: orderId,
            sku: item.sku,
            quantity: item.quantity,
            status: 'ACTIVE',
            expires_at: expiresAt,
          })
          .returning('id');

        if (!reservation) {
          throw new Error(`Failed to persist reservation for SKU ${item.sku}`);
        }

        results.push({
          sku: item.sku,
          quantity: item.quantity,
          reservationId: reservation.id,
        });
      }

      return results;
    });
  }

  async release(orderId: string): Promise<number> {
    return this.db.transaction(async (trx) => {
      const reservations = await trx<ReservationRow>('reservations')
        .where({ order_id: orderId, status: 'ACTIVE' })
        .forUpdate();

      for (const reservation of reservations) {
        await this.releaseReservation(trx, reservation);
      }

      return reservations.length;
    });
  }

  async releaseExpired(now: Date): Promise<ExpiredReservation[]> {
    return this.db.transaction(async (trx) => {
      const expired = await trx<ReservationRow>('reservations')
        .where('status', 'ACTIVE')
        .andWhere('expires_at', '<', now)
        .forUpdate();

      const released: ExpiredReservation[] = [];

      for (const reservation of expired) {
        await this.releaseReservation(trx, reservation, 'EXPIRED');
        released.push({
          reservationId: reservation.id,
          orderId: reservation.order_id,
          sku: reservation.sku,
          quantity: reservation.quantity,
        });
      }

      return released;
    });
  }

  /**
   * Return a single reservation's units to available stock and mark it.
   * Assumes the caller already holds a lock on the reservation row.
   */
  private async releaseReservation(
    trx: Knex.Transaction,
    reservation: ReservationRow,
    status: 'RELEASED' | 'EXPIRED' = 'RELEASED',
  ): Promise<void> {
    const row = await trx<InventoryRow>('inventory')
      .where({ sku: reservation.sku })
      .forUpdate()
      .first();

    if (row) {
      const inventory = this.toDomain(row);
      inventory.release(reservation.quantity);
      await trx<InventoryRow>('inventory')
        .where({ id: row.id })
        .update({
          available_qty: inventory.availableQty,
          reserved_qty: inventory.reservedQty,
          version: inventory.version,
          updated_at: new Date(),
        });
    }

    await trx<ReservationRow>('reservations')
      .where({ id: reservation.id })
      .update({ status, released_at: new Date() });
  }

  private toDomain(row: InventoryRow): Inventory {
    return new Inventory({
      id: row.id,
      productId: row.product_id,
      sku: row.sku,
      availableQty: row.available_qty,
      reservedQty: row.reserved_qty,
      version: row.version,
    });
  }
}
