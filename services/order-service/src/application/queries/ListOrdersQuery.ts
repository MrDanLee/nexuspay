import { Order } from '../../domain/entities/Order';
import { OrderRepository, PaginatedResult } from '../ports/OrderRepository';

export interface ListOrdersOptions {
  customerId: string;
  cursor?: string;
  limit?: number;
  status?: string;
}

/**
 * Query handler for listing orders with cursor-based pagination.
 */
export class ListOrdersHandler {
  private readonly defaultLimit = 20;
  private readonly maxLimit = 100;

  constructor(private readonly orderRepository: OrderRepository) { }

  async execute(options: ListOrdersOptions): Promise<PaginatedResult<Order>> {
    const limit = Math.min(options.limit ?? this.defaultLimit, this.maxLimit);

    return this.orderRepository.findByCustomerId(options.customerId, {
      cursor: options.cursor,
      limit,
      status: options.status,
    });
  }
}