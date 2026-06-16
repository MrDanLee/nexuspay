import { randomUUID } from 'node:crypto';
import {
  DomainEvent,
  EventType,
  Exchanges,
  Publisher,
  createLogger,
} from '@nexuspay/shared';

import { ReserveStockHandler } from '../../application/handlers/ReserveStockHandler';

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
    private readonly publisher: Publisher,
  ) {}

  handle = async (event: DomainEvent): Promise<void> => {
    switch (event.type) {
      case EventType.ORDER_CREATED:
        await this.onOrderCreated(event);
        break;
      default:
        logger.debug({ type: event.type }, 'Ignoring event');
    }
  };

  private async onOrderCreated(event: DomainEvent): Promise<void> {
    const data = event.data as { orderId: string; items: OrderItemPayload[] };
    const items = data.items.map((item) => ({ sku: item.sku, quantity: item.quantity }));

    try {
      const result = await this.reserveStockHandler.execute({ orderId: data.orderId, items });
      await this.publish(EventType.INVENTORY_RESERVED, event, {
        orderId: data.orderId,
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
