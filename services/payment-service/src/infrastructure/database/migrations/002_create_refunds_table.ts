import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refunds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('payment_id')
      .notNullable()
      .references('id')
      .inTable('payments')
      .onDelete('CASCADE');
    table.decimal('amount', 12, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('USD');
    table.string('status', 30).notNullable().defaultTo('PENDING');
    table.string('gateway_refund_id', 100).nullable();
    table.string('idempotency_key', 64).unique().notNullable();
    table.text('reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['payment_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refunds');
}
