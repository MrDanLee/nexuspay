import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('inventory', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('product_id')
      .notNullable()
      .references('id')
      .inTable('products')
      .onDelete('CASCADE');
    table.string('sku', 50).notNullable().unique();
    table.integer('available_qty').notNullable().defaultTo(0);
    table.integer('reserved_qty').notNullable().defaultTo(0);
    table.integer('version').notNullable().defaultTo(1);
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Stock can never go negative.
    table.check('?? >= 0', ['available_qty']);
    table.check('?? >= 0', ['reserved_qty']);

    table.index(['sku']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory');
}
