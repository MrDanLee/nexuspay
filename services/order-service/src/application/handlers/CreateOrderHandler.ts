import { Money, createLogger } from '@nexuspay/shared';

import { Order } from '../../domain/entities/Order';
import { OrderRepository } from '../ports/OrderRepository';
import { CreateOrderCommand } from '../commands/CreateOrderCommand';
import { orderCreatedEvent } from '../events/orderEvents';
import { orderMetrics } from '../../infrastructure/observability/orderMetrics';

const logger = createLogger({ service: 'order-service', handler: 'CreateOrderHandler' });

export interface CreateOrderResult {
  order: Order;
  isExisting: boolean;
}

/**
 * Handles order creation with idempotency.
 *
 * If an order with the same idempotency key already exists,
 * returns the existing order instead of creating a duplicate.
 * This is critical for payment systems where network retries
 * could otherwise result in duplicate charges.
 */
export class CreateOrderHandler {
  constructor(private readonly orderRepository: OrderRepository) { }

  async execute(command: CreateOrderCommand): Promise<CreateOrderResult> {
    // Check for existing order with same idempotency key
    const existing = await this.orderRepository.findByIdempotencyKey(
      command.idempotencyKey,
    );

    if (existing) {
      logger.info(
        { idempotencyKey: command.idempotencyKey, orderId: existing.id },
        'Returning existing order (idempotent request)',
      );
      return { order: existing, isExisting: true };
    }

    // Create the domain entity
    const order = new Order({
      customerId: command.customerId,
      idempotencyKey: command.idempotencyKey,
      currency: command.currency,
      shippingAddress: command.shippingAddress,
      items: command.items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Money.of(item.unitPrice, command.currency),
      })),
    });

    // Persist the order and the OrderCreated event atomically (outbox).
    const saved = await this.orderRepository.save(order, [orderCreatedEvent(order)]);
    orderMetrics.recordCreated();

    logger.info(
      {
        orderId: saved.id,
        customerId: saved.customerId,
        totalAmount: saved.totalAmount.toFixed(),
        itemCount: saved.items.length,
      },
      'Order created successfully',
    );

    return { order: saved, isExisting: false };
  }
}