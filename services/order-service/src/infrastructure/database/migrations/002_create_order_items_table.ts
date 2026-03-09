import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('product_id').notNullable();
    table.string('sku', 50).notNullable();
    table.integer('quantity').notNullable();
    table.decimal('unit_price', 12, 2).notNullable();
    table.decimal('total_price', 12, 2).notNullable();

    table.index(['order_id']);

    // Check constraints
    table.check('?? > 0', ['quantity']);
    table.check('?? > 0', ['unit_price']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_items');
}