import { Knex } from 'knex';
import { ConflictError, NotFoundError, Money } from '@nexuspay/shared';

import { Order } from '../../domain/entities/Order';
import { OrderStatus } from '../../domain/value-objects/OrderStatus';
import {
  OrderRepository,
  PaginationOptions,
  PaginatedResult,
} from '../../application/ports/OrderRepository';

interface OrderRow {
  id: string;
  customer_id: string;
  status: OrderStatus;
  total_amount: string;
  currency: string;
  idempotency_key: string;
  shipping_address: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  version: number;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  sku: string;
  quantity: number;
  unit_price: string;
  total_price: string;
}

/**
 * PostgreSQL implementation of OrderRepository using Knex.
 *
 * Key implementation details:
 * - Optimistic locking via version column on updates
 * - Cursor-based pagination for efficient large dataset traversal
 * - Atomic save: order + items in a single transaction
 */
export class KnexOrderRepository implements OrderRepository {
  constructor(private readonly db: Knex) { }

  async save(order: Order): Promise<Order> {
    return this.db.transaction(async (trx) => {
      // Insert order
      const [row] = await trx<OrderRow>('orders')
        .insert({
          customer_id: order.customerId,
          status: order.status,
          total_amount: order.totalAmount.toFixed(),
          currency: order.currency,
          idempotency_key: order.idempotencyKey,
          shipping_address: JSON.stringify(order.shippingAddress),
          metadata: JSON.stringify(order.metadata),
          version: order.version,
        })
        .returning('*');

      // Insert order items
      if (order.items.length > 0) {
        await trx<OrderItemRow>('order_items').insert(
          order.items.map((item) => ({
            order_id: row.id,
            product_id: item.productId,
            sku: item.sku,
            quantity: item.quantity,
            unit_price: item.unitPrice.toFixed(),
            total_price: item.totalPrice.toFixed(),
          })),
        );
      }

      return this.toDomain(row, order.items.map((item, index) => ({
        id: `generated-${index}`,
        order_id: row.id,
        product_id: item.productId,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unitPrice.toFixed(),
        total_price: item.totalPrice.toFixed(),
      })));
    });
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.db<OrderRow>('orders').where({ id }).first();
    if (!row) return null;

    const items = await this.db<OrderItemRow>('order_items')
      .where({ order_id: id });

    return this.toDomain(row, items);
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const row = await this.db<OrderRow>('orders')
      .where({ idempotency_key: key })
      .first();

    if (!row) return null;

    const items = await this.db<OrderItemRow>('order_items')
      .where({ order_id: row.id });

    return this.toDomain(row, items);
  }

  async update(order: Order): Promise<Order> {
    if (!order.id) {
      throw new Error('Cannot update order without ID');
    }

    const updated = await this.db<OrderRow>('orders')
      .where({ id: order.id, version: order.version - 1 })
      .update({
        status: order.status,
        total_amount: order.totalAmount.toFixed(),
        updated_at: new Date(),
        version: order.version,
        metadata: JSON.stringify(order.metadata),
      })
      .returning('*');

    if (updated.length === 0) {
      throw new ConflictError(
        `Order ${order.id} was modified by another process (version conflict)`,
        { metadata: { orderId: order.id, expectedVersion: order.version - 1 } },
      );
    }

    const items = await this.db<OrderItemRow>('order_items')
      .where({ order_id: order.id });

    return this.toDomain(updated[0], items);
  }

  async findByCustomerId(
    customerId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Order>> {
    const { cursor, limit, status } = options;

    let query = this.db<OrderRow>('orders')
      .where({ customer_id: customerId })
      .orderBy('created_at', 'desc')
      .limit(limit + 1); // Fetch one extra to determine hasMore

    if (status) {
      query = query.where({ status });
    }

    if (cursor) {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      query = query.where('created_at', '<', decoded.createdAt);
    }

    const rows = await query;
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);

    // Fetch items for all orders in one query
    const orderIds = data.map((r) => r.id);
    const allItems = orderIds.length > 0
      ? await this.db<OrderItemRow>('order_items').whereIn('order_id', orderIds)
      : [];

    const orders = data.map((row) => {
      const items = allItems.filter((item) => item.order_id === row.id);
      return this.toDomain(row, items);
    });

    const nextCursor = hasMore && data.length > 0
      ? Buffer.from(
        JSON.stringify({ createdAt: data[data.length - 1].created_at }),
      ).toString('base64')
      : undefined;

    return {
      data: orders,
      pagination: { limit, hasMore, nextCursor },
    };
  }

  /**
   * Map database rows to domain entity.
   */
  private toDomain(row: OrderRow, items: OrderItemRow[]): Order {
    return new Order({
      id: row.id,
      customerId: row.customer_id,
      status: row.status,
      currency: row.currency,
      idempotencyKey: row.idempotency_key,
      shippingAddress: row.shipping_address,
      metadata: row.metadata,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Money.of(item.unit_price, row.currency),
      })),
    });
  }
}