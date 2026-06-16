import knex, { Knex } from 'knex';

import { config } from '../../config';

let db: Knex | null = null;

/**
 * Get or create the database connection.
 *
 * Uses a connection pool to efficiently manage PostgreSQL connections.
 * Inventory operations rely on row-level locking, so the pool must be
 * large enough to service concurrent reservations without starving.
 */
export function getDatabase(): Knex {
  if (!db) {
    db = knex({
      client: 'pg',
      connection: config.INVENTORY_DB_URL,
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 60000,
      },
      migrations: {
        directory: './src/infrastructure/database/migrations',
        extension: 'ts',
      },
    });
  }
  return db;
}

/**
 * Close the database connection pool.
 * Called during graceful shutdown.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

/**
 * Health check: verify database connectivity.
 */
export async function checkDatabaseHealth(): Promise<void> {
  const database = getDatabase();
  await database.raw('SELECT 1');
}
