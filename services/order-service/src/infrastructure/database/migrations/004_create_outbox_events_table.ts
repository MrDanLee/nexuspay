import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('outbox_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('aggregate_type', 50).notNullable();
    table.uuid('aggregate_id').notNullable();
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.boolean('published').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('published_at', { useTz: true }).nullable();

    // Index for the outbox poller: find unpublished events efficiently
    table.index(['published', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('outbox_events');
}