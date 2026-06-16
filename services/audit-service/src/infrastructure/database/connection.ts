import knex, { Knex } from 'knex';

import { config } from '../../config';

let db: Knex | null = null;

/**
 * Get or create the database connection pool.
 *
 * The audit store is append-only and write-heavy (every domain event lands
 * here), so the pool favours throughput for inserts and range queries.
 */
export function getDatabase(): Knex {
  if (!db) {
    db = knex({
      client: 'pg',
      connection: config.AUDIT_DB_URL,
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

/** Close the database connection pool (graceful shutdown). */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

/** Health check: verify database connectivity. */
export async function checkDatabaseHealth(): Promise<void> {
  const database = getDatabase();
  await database.raw('SELECT 1');
}
