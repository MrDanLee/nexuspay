import type { Knex } from 'knex';

/**
 * Knex CLI configuration for migrations (`npm run migrate`).
 *
 * The DB URL is read straight from the environment (same default as the
 * service config) so the CLI does not need to pull in the shared config
 * loader. ts-node runs the TypeScript migrations directly.
 */
const config: Knex.Config = {
  client: 'pg',
  connection:
    process.env.INVENTORY_DB_URL ??
    'postgres://nexuspay:nexuspay_dev@localhost:5435/nexuspay_inventory',
  migrations: {
    directory: './src/infrastructure/database/migrations',
    extension: 'ts',
  },
};

export default config;
