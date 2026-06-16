/**
 * Seed the inventory database with a realistic product catalog.
 *
 * Idempotent: re-running updates existing rows (matched by SKU) instead
 * of duplicating them.
 *
 * Usage:
 *   docker-compose up -d postgres-inventory
 *   cd services/inventory-service && npx knex migrate:latest && npm run seed
 */
import { getDatabase, closeDatabase } from '../src/infrastructure/database/connection';

interface SeedProduct {
  sku: string;
  name: string;
  price: string;
  stock: number;
}

const PRODUCTS: SeedProduct[] = [
  { sku: 'LAPTOP-PRO-15', name: 'NexusBook Pro 15"', price: '1999.00', stock: 25 },
  { sku: 'LAPTOP-AIR-13', name: 'NexusBook Air 13"', price: '1199.00', stock: 40 },
  { sku: 'PHONE-X-256', name: 'Nexus Phone X 256GB', price: '999.00', stock: 60 },
  { sku: 'PHONE-X-128', name: 'Nexus Phone X 128GB', price: '899.00', stock: 80 },
  { sku: 'TABLET-11', name: 'Nexus Tablet 11"', price: '649.00', stock: 35 },
  { sku: 'WATCH-S2', name: 'Nexus Watch Series 2', price: '399.00', stock: 50 },
  { sku: 'EARBUDS-PRO', name: 'Nexus Earbuds Pro', price: '249.00', stock: 120 },
  { sku: 'HEADPHONE-MAX', name: 'Nexus Headphones Max', price: '549.00', stock: 30 },
  { sku: 'MONITOR-27-4K', name: 'Nexus Display 27" 4K', price: '699.00', stock: 22 },
  { sku: 'MONITOR-32-5K', name: 'Nexus Display 32" 5K', price: '1299.00', stock: 15 },
  { sku: 'KEYBOARD-MX', name: 'Nexus Mechanical Keyboard', price: '149.00', stock: 90 },
  { sku: 'MOUSE-ERGO', name: 'Nexus Ergo Mouse', price: '89.00', stock: 110 },
  { sku: 'USB-C-CABLE', name: 'USB-C Charge Cable 2m', price: '19.99', stock: 500 },
  { sku: 'CHARGER-65W', name: 'Nexus 65W USB-C Charger', price: '49.00', stock: 200 },
  { sku: 'DOCK-TB4', name: 'Nexus Thunderbolt 4 Dock', price: '299.00', stock: 18 },
  { sku: 'WEBCAM-4K', name: 'Nexus Webcam 4K', price: '129.00', stock: 45 },
  { sku: 'SSD-1TB', name: 'Nexus Portable SSD 1TB', price: '159.00', stock: 75 },
  { sku: 'SSD-2TB', name: 'Nexus Portable SSD 2TB', price: '279.00', stock: 40 },
  { sku: 'ROUTER-WIFI7', name: 'Nexus Router WiFi 7', price: '349.00', stock: 28 },
  { sku: 'SPEAKER-360', name: 'Nexus Speaker 360', price: '199.00', stock: 55 },
];

async function seed(): Promise<void> {
  const db = getDatabase();

  for (const product of PRODUCTS) {
    const [row] = await db('products')
      .insert({
        sku: product.sku,
        name: product.name,
        price: product.price,
        currency: 'USD',
      })
      .onConflict('sku')
      .merge(['name', 'price'])
      .returning('id');

    if (!row) continue;

    await db('inventory')
      .insert({
        product_id: row.id,
        sku: product.sku,
        available_qty: product.stock,
      })
      .onConflict('sku')
      .merge(['available_qty']);
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${PRODUCTS.length} products with initial stock`);
}

seed()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', error);
    process.exit(1);
  });
