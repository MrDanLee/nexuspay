export interface SagaStep {
  id: string;
  orderId: string;
  stepName: string;
  status: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

/**
 * Port for recording saga progress.
 *
 * Each step a saga goes through (per order) is recorded with its status,
 * timing, and retry count, enabling operators to inspect and debug a
 * failed or stuck saga and powering the order timeline endpoint.
 */
export interface SagaStepRepository {
  /** Upsert a step's status for an order, incrementing retry_count on repeat. */
  record(orderId: string, stepName: string, status: string, error?: string): Promise<void>;

  /** All recorded steps for an order, oldest first. */
  findByOrderId(orderId: string): Promise<SagaStep[]>;
}
