import { Knex } from 'knex';

import { SagaStepRepository, SagaStep } from '../../application/ports/SagaStepRepository';

interface SagaStepRow {
  id: string;
  order_id: string;
  step_name: string;
  status: string;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  retry_count: number;
}

/**
 * PostgreSQL implementation of SagaStepRepository using Knex.
 *
 * record() upserts on (order_id, step_name): a repeated step (e.g. a retry)
 * updates the status and bumps retry_count rather than inserting a
 * duplicate, thanks to the table's unique constraint.
 */
export class KnexSagaStepRepository implements SagaStepRepository {
  constructor(private readonly db: Knex) {}

  async record(orderId: string, stepName: string, status: string, error?: string): Promise<void> {
    const now = new Date();
    const completedAt = status === 'PENDING' ? null : now;

    await this.db('saga_steps')
      .insert({
        order_id: orderId,
        step_name: stepName,
        status,
        error: error ?? null,
        started_at: now,
        completed_at: completedAt,
        retry_count: 0,
      })
      .onConflict(['order_id', 'step_name'])
      .merge({
        status,
        error: error ?? null,
        completed_at: completedAt,
        retry_count: this.db.raw('saga_steps.retry_count + 1'),
      });
  }

  async findByOrderId(orderId: string): Promise<SagaStep[]> {
    const rows = await this.db<SagaStepRow>('saga_steps')
      .where({ order_id: orderId })
      .orderBy('started_at', 'asc');

    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      stepName: row.step_name,
      status: row.status,
      error: row.error ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      retryCount: row.retry_count,
    }));
  }
}
