import { randomUUID } from 'node:crypto';
import {
  DomainEvent,
  EventType,
  Exchanges,
  Publisher,
  createLogger,
} from '@nexuspay/shared';

import { ReserveStockHandler } from '../../application/handlers/ReserveStockHandler';
import { ReleaseStockHandler } from '../../application/handlers/ReleaseStockHandler';

const logger = createLogger({ service: 'inventory-service', component: 'eventHandlers' });

interface OrderItemPayload {
  sku: string;
  quantity: number;
}

/**
 * Consumes order lifecycle events and drives inventory reservations.
 *
 * On OrderCreated it reserves stock and emits inventory.reserved, or
 * inventory.failed if the reservation cannot be satisfied. Errors thrown
 * here would otherwise nack the message; emitting inventory.failed instead
 * lets the saga compensate deterministically.
 */
export class InventoryEventHandlers {
  constructor(
    private readonly reserveStockHandler: ReserveStockHandler,
    private readonly releaseStockHandler: ReleaseStockHandler,
    private readonly publisher: Publisher,
  ) {}

  handle = async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case EventType.ORDER_CREATED:
        await this.onOrderCreated(event);
        break;
      case EventType.ORDER_CANCELLED:
        await this.onOrderCancelled(event);
        break;
      default:
        logger.debug({ type: event.type }, 'Ignoring event');
    }
  };

  private async onOrderCreated(event: DomainEvent): Promise<void> {
    const data = event.data as {
      orderId: string;
      customerId?: string;
      totalAmount?: number;
      currency?: string;
      items: OrderItemPayload[];
    };
    const items = data.items.map((item) => ({ sku: item.sku, quantity: item.quantity }));

    try {
      const result = await this.reserveStockHandler.execute({ orderId: data.orderId, items });
      // Forward the order context so the payment step has the amount.
      await this.publish(EventType.INVENTORY_RESERVED, event, {
        orderId: data.orderId,
        customerId: data.customerId,
        totalAmount: data.totalAmount,
        currency: data.currency,
        reservations: result.reservations,
      });
      logger.info({ orderId: data.orderId }, 'Stock reserved, emitted inventory.reserved');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'reservation failed';
      await this.publish(EventType.INVENTORY_FAILED, event, {
        orderId: data.orderId,
        reason,
      });
      logger.warn({ orderId: data.orderId, reason }, 'Reservation failed, emitted inventory.failed');
    }
  }

  private async onOrderCancelled(event: DomainEvent): Promise<void> {
    const data = event.data as { orderId: string };
    const result = await this.releaseStockHandler.execute({ orderId: data.orderId });

    if (result.releasedCount > 0) {
      await this.publish(EventType.INVENTORY_RELEASED, event, { orderId: data.orderId });
      logger.info(
        { orderId: data.orderId, releasedCount: result.releasedCount },
        'Stock released, emitted inventory.released',
      );
    } else {
      logger.debug({ orderId: data.orderId }, 'No active reservations to release');
    }
  }

  private async publish(
    type: string,
    causedBy: DomainEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    const event: DomainEvent = {
      id: randomUUID(),
      type: type as DomainEvent['type'],
      source: 'inventory-service',
      timestamp: new Date().toISOString(),
      correlationId: causedBy.correlationId,
      causationId: causedBy.id,
      data,
      metadata: { version: 1 },
    };
    await this.publisher.publish(Exchanges.INVENTORY, type, event);
  }
}
