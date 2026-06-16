/**
 * An event to be published, written to the outbox in the same transaction
 * as the aggregate change that produced it.
 */
export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface OutboxRecord extends OutboxEventInput {
  id: string;
  createdAt: Date;
}

/**
 * Port for the transactional outbox.
 *
 * Writes happen inside the aggregate's transaction (see OrderRepository).
 * The poller uses findUnpublished/markPublished to relay events to the
 * broker, giving at-least-once publishing without a distributed
 * transaction between the database and RabbitMQ.
 */
export interface OutboxRepository {
  findUnpublished(limit: number): Promise<OutboxRecord[]>;
  markPublished(ids: string[]): Promise<void>;
}
