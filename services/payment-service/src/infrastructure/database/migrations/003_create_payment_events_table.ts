import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payment_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('payment_id')
      .notNullable()
      .references('id')
      .inTable('payments')
      .onDelete('CASCADE');
    table.string('event_type', 50).notNullable();
    table.string('from_status', 30).nullable();
    table.string('to_status', 30).nullable();
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Append-only log: reconstruct a payment's timeline in order.
    table.index(['payment_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payment_events');
}
