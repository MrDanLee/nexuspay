import { Knex } from 'knex';

/**
 * Adds a metadata column to the outbox so events can carry out-of-band context
 * (notably the W3C traceparent captured when the event was produced). The
 * poller publishes outside any request, so without this the originating trace
 * would be lost at the broker hop.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('outbox_events', (table) => {
    table.jsonb('metadata').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('outbox_events', (table) => {
    table.dropColumn('metadata');
  });
}
