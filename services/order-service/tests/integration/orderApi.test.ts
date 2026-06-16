import { randomUUID } from 'node:crypto';
import express, { Application } from 'express';
import pino from 'pino';
import supertest from 'supertest';
import {
  requestIdMiddleware,
  errorHandlerMiddleware,
} from '@nexuspay/shared';

import { Order } from '../../src/domain/entities/Order';
import {
  OrderRepository,
  PaginatedResult,
  PaginationOptions,
} from '../../src/application/ports/OrderRepository';
import { CreateOrderHandler } from '../../src/application/handlers/CreateOrderHandler';
import { CancelOrderHandler } from '../../src/application/handlers/CancelOrderHandler';
import { GetOrderHandler } from '../../src/application/queries/GetOrderQuery';
import { ListOrdersHandler } from '../../src/application/queries/ListOrdersQuery';
import { OrderController } from '../../src/interfaces/http/controllers/OrderController';
import { createOrderRoutes } from '../../src/interfaces/http/routes/orderRoutes';

/**
 * API integration tests for the order endpoints.
 *
 * These exercise the full HTTP stack — routing, Zod validation, the
 * controller, application handlers, and the domain entity — wired to an
 * in-memory repository. This keeps them fast and dependency-free (no
 * database or Docker required) while still verifying the real request
 * lifecycle end to end. Repository-level persistence is covered
 * separately by the Testcontainers-backed repository tests.
 */
class InMemoryOrderRepository implements OrderRepository {
  private readonly byId = new Map<string, Order>();

  private rehydrate(order: Order, id: string): Order {
    return new Order({
      id,
      customerId: order.customerId,
      idempotencyKey: order.idempotencyKey,
      currency: order.currency,
      status: order.status,
      version: order.version,
      shippingAddress: order.shippingAddress,
      metadata: order.metadata,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
  }

  async save(order: Order): Promise<Order> {
    const id = randomUUID();
    const stored = this.rehydrate(order, id);
    this.byId.set(id, stored);
    return stored;
  }

  async findById(id: string): Promise<Order | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    for (const order of this.byId.values()) {
      if (order.idempotencyKey === key) return order;
    }
    return null;
  }

  async update(order: Order): Promise<Order> {
    if (!order.id) throw new Error('Cannot update order without ID');
    const stored = this.rehydrate(order, order.id);
    this.byId.set(order.id, stored);
    return stored;
  }

  async findByCustomerId(
    customerId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Order>> {
    const all = [...this.byId.values()]
      .filter((o) => o.customerId === customerId)
      .filter((o) => (options.status ? o.status === options.status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const data = all.slice(0, options.limit);
    const hasMore = all.length > options.limit;

    return {
      data,
      pagination: { limit: options.limit, hasMore },
    };
  }
}

function buildApp(repository: OrderRepository): Application {
  const logger = pino({ level: 'silent' });

  const controller = new OrderController(
    new CreateOrderHandler(repository),
    new CancelOrderHandler(repository),
    new GetOrderHandler(repository),
    new ListOrdersHandler(repository),
  );

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware());
  app.use('/api/v1/orders', createOrderRoutes(controller));
  app.use(errorHandlerMiddleware(logger));
  return app;
}

const validBody = {
  currency: 'USD',
  items: [
    {
      productId: randomUUID(),
      sku: 'LAPTOP-PRO-15',
      quantity: 1,
      unitPrice: 999.99,
    },
    {
      productId: randomUUID(),
      sku: 'USB-C-CABLE',
      quantity: 2,
      unitPrice: 19.99,
    },
  ],
  shippingAddress: {
    line1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94102',
    country: 'US',
  },
};

describe('Order API', () => {
  let app: Application;

  beforeEach(() => {
    app = buildApp(new InMemoryOrderRepository());
  });

  describe('POST /api/v1/orders', () => {
    it('creates an order and returns 201 with the computed total', async () => {
      const res = await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-1')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('CREATED');
      expect(res.body.totalAmount).toBeCloseTo(1039.97, 2);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.links.self).toBe(`/api/v1/orders/${res.body.id}`);
    });

    it('returns the existing order (200) for a duplicate idempotency key', async () => {
      const first = await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-dup')
        .send(validBody);

      const second = await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-dup')
        .send(validBody);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
    });

    it('returns 400 when the Idempotency-Key header is missing', async () => {
      const res = await supertest(app).post('/api/v1/orders').send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.status).toBe(400);
    });

    it('returns 400 with field details for invalid input', async () => {
      const res = await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-bad')
        .send({ ...validBody, items: [] });

      expect(res.status).toBe(400);
      expect(res.body.fields).toBeDefined();
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('returns the order by id', async () => {
      const created = await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-get')
        .send(validBody);

      const res = await supertest(app).get(`/api/v1/orders/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it('returns 404 for an unknown order', async () => {
      const res = await supertest(app).get(`/api/v1/orders/${randomUUID()}`);

      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed order id', async () => {
      const res = await supertest(app).get('/api/v1/orders/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/orders', () => {
    it('lists orders with pagination metadata', async () => {
      await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-list-1')
        .send(validBody);
      await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-list-2')
        .send(validBody);

      const res = await supertest(app).get('/api/v1/orders?limit=1');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.hasMore).toBe(true);
    });
  });

  describe('POST /api/v1/orders/:id/cancel', () => {
    it('cancels a CREATED order', async () => {
      const created = await supertest(app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', 'idem-cancel')
        .send(validBody);

      const res = await supertest(app)
        .post(`/api/v1/orders/${created.body.id}/cancel`)
        .send({ reason: 'changed my mind' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });
  });
});
