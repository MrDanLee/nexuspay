import { DomainEvent, Logger } from '@nexuspay/shared';

import { AuditRepository, AuditAppendInput } from '../../application/ports/AuditRepository';

/**
 * Consumes every domain event and appends it to the audit log.
 *
 * The append is idempotent (unique event id), so redeliveries are harmless.
 * Mapping is generic: the aggregate type is derived from the event type prefix
 * (e.g. "order.created" -> "order") and the aggregate id from the common
 * payload fields, falling back to the correlation id.
 */
export class AuditEventHandlers {
  constructor(
    private readonly repository: AuditRepository,
    private readonly logger: Logger,
  ) {}

  handle = async (event: DomainEvent): Promise<void> => {
    await this.repository.append(this.toAuditInput(event));
    this.logger.debug({ eventId: event.id, type: event.type }, 'Event recorded to audit log');
  };

  private toAuditInput(event: DomainEvent): AuditAppendInput {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const aggregateId =
      (data.orderId as string | undefined) ??
      (data.paymentId as string | undefined) ??
      (data.aggregateId as string | undefined) ??
      event.correlationId;

    return {
      eventId: event.id,
      eventType: event.type,
      source: event.source,
      aggregateType: event.type.split('.')[0],
      aggregateId,
      correlationId: event.correlationId,
      causationId: event.causationId,
      payload: data,
      metadata: event.metadata as unknown as Record<string, unknown>,
      occurredAt: event.timestamp ? new Date(event.timestamp) : undefined,
    };
  }
}
