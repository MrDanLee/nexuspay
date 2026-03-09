import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('customer_id').notNullable().index();
    table.string('status', 30).notNullable().defaultTo('CREATED');
    table.decimal('total_amount', 12, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('idempotency_key', 64).unique().notNullable();
    table.jsonb('shipping_address').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.integer('version').notNullable().defaultTo(1);

    // Indexes for common queries
    table.index(['status']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('orders');
}