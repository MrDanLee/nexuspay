import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reservations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable();
    table.string('sku', 50).notNullable();
    table.integer('quantity').notNullable();
    table.string('status', 20).notNullable().defaultTo('ACTIVE');
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('released_at', { useTz: true }).nullable();

    table.check('?? > 0', ['quantity']);

    // The outbox/consumer side reserves per (order, sku) at most once.
    table.unique(['order_id', 'sku']);
    table.index(['order_id']);
    table.index(['status', 'expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reservations');
}
