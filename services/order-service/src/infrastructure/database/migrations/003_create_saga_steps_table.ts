import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('saga_steps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.string('step_name', 50).notNullable();
    table.string('status', 20).notNullable().defaultTo('PENDING');
    table.jsonb('payload').nullable();
    table.jsonb('response').nullable();
    table.text('error').nullable();
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.integer('retry_count').defaultTo(0);

    table.unique(['order_id', 'step_name']);
    table.index(['order_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('saga_steps');
}