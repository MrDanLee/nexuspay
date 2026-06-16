import { Order } from '../../domain/entities/Order';

import { OutboxEventInput } from './OutboxRepository';

/**
 * Port (interface) for order persistence.
 *
 * Following hexagonal architecture, the application layer defines
 * this interface and the infrastructure layer implements it.
 * This allows swapping the data source without changing business logic.
 */
export interface OrderRepository {
  /**
   * Save a new order, optionally writing domain events to the outbox in
   * the same transaction (transactional outbox).
   * @returns The saved order with generated ID
   */
  save(order: Order, outboxEvents?: OutboxEventInput[]): Promise<Order>;

  /**
   * Find an order by ID.
   * @returns The order or null if not found
   */
  findById(id: string): Promise<Order | null>;

  /**
   * Find an order by idempotency key.
   * Used to detect duplicate order creation requests.
   */
  findByIdempotencyKey(key: string): Promise<Order | null>;

  /**
   * Update an existing order, optionally writing domain events to the
   * outbox in the same transaction.
   * Uses optimistic locking — throws ConflictError if version mismatch.
   */
  update(order: Order, outboxEvents?: OutboxEventInput[]): Promise<Order>;

  /**
   * List orders for a customer with cursor-based pagination.
   */
  findByCustomerId(
    customerId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Order>>;
}

export interface PaginationOptions {
  cursor?: string;
  limit: number;
  status?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}