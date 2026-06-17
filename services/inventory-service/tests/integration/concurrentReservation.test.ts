import { ConflictError } from '@nexuspay/shared';
import knex, { Knex } from 'knex';

import { up as createProducts } from '../../src/infrastructure/database/migrations/001_create_products_table';
import { up as createInventory } from '../../src/infrastructure/database/migrations/002_create_inventory_table';
import { up as createReservations } from '../../src/infrastructure/database/migrations/003_create_reservations_table';
import { KnexInventoryRepository } from '../../src/infrastructure/repositories/KnexInventoryRepository';

/**
 * Concurrency tests for stock reservation against a real PostgreSQL
 * instance (docker-compose or Testcontainers). They prove that the
 * SELECT ... FOR UPDATE locking prevents overselling under contention.
 *
 * These require a reachable database, so they are gated behind
 * RUN_INTEGRATION_DB=1 and skipped by default to keep `npm test` green in
 * environments without Docker. To run them:
 *
 *   docker-compose up -d postgres-inventory
 *   RUN_INTEGRATION_DB=1 npm test --workspace @nexuspay/inventory-service
 */
const SHOULD_RUN = process.env.RUN_INTEGRATION_DB === '1';
const describeDb = SHOULD_RUN ? describe : describe.skip;

const DB_URL =
  process.env.INVENTORY_DB_URL ??
  'postgres://nexuspay:nexuspay_dev@localhost:5435/nexuspay_inventory';

describeDb('Inventory concurrency (PostgreSQL)', () => {
  let db: Knex;
  let repo: KnexInventoryRepository;
  let productId: string;

  beforeAll(async () => {
    db = knex({ client: 'pg', connection: DB_URL, pool: { min: 1, max: 10 } });
    await db.schema.dropTableIfExists('reservations');
    await db.schema.dropTableIfExists('inventory');
    await db.schema.dropTableIfExists('products');
    await createProducts(db);
    await createInventory(db);
    await createReservations(db);
    repo = new KnexInventoryRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  beforeEach(async () => {
    await db('reservations').del();
    await db('inventory').del();
    await db('products').del();
    const [product] = await db('products')
      .insert({ sku: 'LAST-ITEM', name: 'Last Item', price: '10.00', currency: 'USD' })
      .returning('id');
    productId = product.id;
  });

  const seedStock = async (sku: string, availableQty: number) => {
    await db('inventory').insert({ product_id: productId, sku, available_qty: availableQty });
  };

  const expiresAt = () => new Date(Date.now() + 60_000);

  it('lets only one of two concurrent reserves take the last unit', async () => {
    await seedStock('LAST-ITEM', 1);

    const results = await Promise.allSettled([
      repo.reserve('order-A', [{ sku: 'LAST-ITEM', quantity: 1 }], expiresAt()),
      repo.reserve('order-B', [{ sku: 'LAST-ITEM', quantity: 1 }], expiresAt()),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    const stock = await repo.findBySku('LAST-ITEM');
    expect(stock?.availableQty).toBe(0);
    expect(stock?.reservedQty).toBe(1);
  });

  it('never oversells under many concurrent reserves', async () => {
    await seedStock('LAST-ITEM', 3);

    const attempts = Array.from({ length: 8 }, (_, i) =>
      repo.reserve(`order-${i}`, [{ sku: 'LAST-ITEM', quantity: 1 }], expiresAt()),
    );
    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(3);

    const stock = await repo.findBySku('LAST-ITEM');
    expect(stock?.availableQty).toBe(0);
    expect(stock?.reservedQty).toBe(3);
  });
});
