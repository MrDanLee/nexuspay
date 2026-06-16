import { Knex } from 'knex';

/**
 * Append-only audit log of every domain event in the system.
 *
 * The table is write-once: rows are only ever inserted, never updated or
 * deleted. event_id is unique so a redelivered event is recorded at most once
 * (the repository relies on this for idempotent inserts). Indexes support the
 * two query shapes the API exposes: by aggregate, and by type within a time
 * range.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // The originating domain event's identity (unique => idempotent ingest).
    table.uuid('event_id').notNullable().unique();
    table.string('event_type', 100).notNullable();
    table.string('source', 50).notNullable();

    // Aggregate this event belongs to (for per-entity history queries).
    table.string('aggregate_type', 50).nullable();
    table.uuid('aggregate_id').nullable();

    // Causal chain identifiers carried on every domain event.
    table.string('correlation_id', 100).nullable();
    table.string('causation_id', 100).nullable();

    table.jsonb('payload').notNullable();
    table.jsonb('metadata').nullable();

    // When the event occurred (from the event) vs. when we recorded it.
    table.timestamp('occurred_at', { useTz: true }).nullable();
    table.timestamp('recorded_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['aggregate_id']);
    table.index(['event_type', 'recorded_at']);
    table.index(['recorded_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_events');
}
