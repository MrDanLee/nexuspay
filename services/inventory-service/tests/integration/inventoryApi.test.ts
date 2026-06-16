import { randomUUID } from 'node:crypto';
import express, { Application } from 'express';
import pino from 'pino';
import supertest from 'supertest';
import {
  requestIdMiddleware,
  errorHandlerMiddleware,
  NotFoundError,
} from '@nexuspay/shared';

import { Inventory } from '../../src/domain/entities/Inventory';
import {
  InventoryRepository,
  ReservationItem,
  ReservationResult,
  ExpiredReservation,
} from '../../src/application/ports/InventoryRepository';
import { ReserveStockHandler } from '../../src/application/handlers/ReserveStockHandler';
import { ReleaseStockHandler } from '../../src/application/handlers/ReleaseStockHandler';
import { CheckStockHandler } from '../../src/application/queries/CheckStockQuery';
import { InventoryController } from '../../src/interfaces/http/controllers/InventoryController';
import { createInventoryRoutes } from '../../src/interfaces/http/routes/inventoryRoutes';

interface StoredReservation {
  id: string;
  orderId: string;
  sku: string;
  quantity: number;
  status: 'ACTIVE' | 'RELEASED';
}

/**
 * In-memory repository that mirrors the real all-or-nothing reserve and
 * idempotent release semantics so the API can be tested without a
 * database. The domain entity drives the stock math, so ConflictError on
 * insufficient stock still propagates exactly as in production.
 */
class InMemoryInventoryRepository implements InventoryRepository {
  private readonly stock = new Map<string, Inventory>();
  private readonly reservations: StoredReservation[] = [];
  private seq = 0;

  seed(sku: string, availableQty: number): void {
    this.stock.set(sku, new Inventory({ productId: randomUUID(), sku, availableQty }));
  }

  async findBySku(sku: string): Promise<Inventory | null> {
    return this.stock.get(sku) ?? null;
  }

  async findBySkus(skus: string[]): Promise<Inventory[]> {
    return skus.map((s) => this.stock.get(s)).filter((i): i is Inventory => i !== undefined);
  }

  async reserve(
    orderId: string,
    items: ReservationItem[],
    _expiresAt: Date,
  ): Promise<ReservationResult[]> {
    const applied: Array<{ sku: string; quantity: number }> = [];
    const results: ReservationResult[] = [];

    try {
      for (const item of items) {
        const inv = this.stock.get(item.sku);
        if (!inv) {
          throw new NotFoundError(`Unknown SKU ${item.sku}`);
        }
        inv.reserve(item.quantity); // throws ConflictError on insufficient stock
        applied.push(item);
        const id = `res-${++this.seq}`;
        this.reservations.push({
          id,
          orderId,
          sku: item.sku,
          quantity: item.quantity,
          status: 'ACTIVE',
        });
        results.push({ sku: item.sku, quantity: item.quantity, reservationId: id });
      }
      return results;
    } catch (error) {
      // All-or-nothing: undo everything applied before the failure.
      for (const item of applied) {
        this.stock.get(item.sku)?.release(item.quantity);
      }
      this.reservations.splice(this.reservations.length - applied.length, applied.length);
      throw error;
    }
  }

  async release(orderId: string): Promise<number> {
    let count = 0;
    for (const reservation of this.reservations) {
      if (reservation.orderId === orderId && reservation.status === 'ACTIVE') {
        this.stock.get(reservation.sku)?.release(reservation.quantity);
        reservation.status = 'RELEASED';
        count += 1;
      }
    }
    return count;
  }

  async releaseExpired(): Promise<ExpiredReservation[]> {
    return [];
  }
}

function buildApp(repo: InventoryRepository): Application {
  const logger = pino({ level: 'silent' });
  const controller = new InventoryController(
    new ReserveStockHandler(repo, 900),
    new ReleaseStockHandler(repo),
    new CheckStockHandler(repo),
  );

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware());
  app.use('/api/v1/inventory', createInventoryRoutes(controller));
  app.use(errorHandlerMiddleware(logger));
  return app;
}

describe('Inventory API', () => {
  let app: Application;
  let repo: InMemoryInventoryRepository;

  beforeEach(() => {
    repo = new InMemoryInventoryRepository();
    repo.seed('LAPTOP-PRO-15', 5);
    repo.seed('USB-C-CABLE', 100);
    app = buildApp(repo);
  });

  describe('GET /api/v1/inventory/:sku', () => {
    it('returns the stock level for a known SKU', async () => {
      const res = await supertest(app).get('/api/v1/inventory/LAPTOP-PRO-15');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ sku: 'LAPTOP-PRO-15', availableQty: 5, found: true });
    });

    it('returns 404 for an unknown SKU', async () => {
      const res = await supertest(app).get('/api/v1/inventory/DOES-NOT-EXIST');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/inventory/check', () => {
    it('returns availability for every requested SKU in order', async () => {
      const res = await supertest(app).get(
        '/api/v1/inventory/check?skus=LAPTOP-PRO-15,UNKNOWN,USB-C-CABLE',
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0]).toMatchObject({ sku: 'LAPTOP-PRO-15', availableQty: 5, found: true });
      expect(res.body.data[1]).toMatchObject({ sku: 'UNKNOWN', availableQty: 0, found: false });
      expect(res.body.data[2]).toMatchObject({ sku: 'USB-C-CABLE', availableQty: 100, found: true });
    });

    it('returns 400 when skus is missing', async () => {
      const res = await supertest(app).get('/api/v1/inventory/check');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/inventory/reserve', () => {
    it('reserves stock and returns reservation IDs', async () => {
      const res = await supertest(app)
        .post('/api/v1/inventory/reserve')
        .send({
          orderId: randomUUID(),
          items: [
            { sku: 'LAPTOP-PRO-15', quantity: 2 },
            { sku: 'USB-C-CABLE', quantity: 3 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.reservations).toHaveLength(2);
      expect(res.body.reservations[0].reservationId).toBeDefined();

      const after = await supertest(app).get('/api/v1/inventory/LAPTOP-PRO-15');
      expect(after.body.availableQty).toBe(3);
      expect(after.body.reservedQty).toBe(2);
    });

    it('returns 409 when stock is insufficient and reserves nothing', async () => {
      const res = await supertest(app)
        .post('/api/v1/inventory/reserve')
        .send({
          orderId: randomUUID(),
          items: [
            { sku: 'USB-C-CABLE', quantity: 1 },
            { sku: 'LAPTOP-PRO-15', quantity: 99 },
          ],
        });

      expect(res.status).toBe(409);

      // All-or-nothing: the USB cable reservation must have been rolled back.
      const cable = await supertest(app).get('/api/v1/inventory/USB-C-CABLE');
      expect(cable.body.availableQty).toBe(100);
    });

    it('returns 404 for an unknown SKU', async () => {
      const res = await supertest(app)
        .post('/api/v1/inventory/reserve')
        .send({ orderId: randomUUID(), items: [{ sku: 'NOPE', quantity: 1 }] });

      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid request body', async () => {
      const res = await supertest(app)
        .post('/api/v1/inventory/reserve')
        .send({ orderId: 'not-a-uuid', items: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/inventory/release', () => {
    it('releases reservations and is idempotent', async () => {
      const orderId = randomUUID();
      await supertest(app)
        .post('/api/v1/inventory/reserve')
        .send({ orderId, items: [{ sku: 'LAPTOP-PRO-15', quantity: 2 }] });

      const first = await supertest(app).post('/api/v1/inventory/release').send({ orderId });
      expect(first.status).toBe(200);
      expect(first.body.releasedCount).toBe(1);

      const second = await supertest(app).post('/api/v1/inventory/release').send({ orderId });
      expect(second.status).toBe(200);
      expect(second.body.releasedCount).toBe(0);

      const after = await supertest(app).get('/api/v1/inventory/LAPTOP-PRO-15');
      expect(after.body.availableQty).toBe(5);
      expect(after.body.reservedQty).toBe(0);
    });
  });
});
