import { randomUUID } from 'node:crypto';
import amqp, { ChannelModel, ConfirmChannel, Channel } from 'amqplib';
import knex, { Knex } from 'knex';
import pino from 'pino';
import { Publisher, Consumer, setupTopology, Exchanges, Queues } from '@nexuspay/shared';

import { KnexOrderRepository } from '../../src/infrastructure/repositories/KnexOrderRepository';
import { KnexOutboxRepository } from '../../src/infrastructure/repositories/KnexOutboxRepository';
import { KnexSagaStepRepository } from '../../src/infrastructure/repositories/KnexSagaStepRepository';
import { CreateOrderHandler } from '../../src/application/handlers/CreateOrderHandler';
import { OutboxPoller } from '../../src/infrastructure/messaging/OutboxPoller';
import { OrderEventHandlers } from '../../src/interfaces/messaging/eventHandlers';
import { OrderStatus } from '../../src/domain/value-objects/OrderStatus';
import { up as createOrders } from '../../src/infrastructure/database/migrations/001_create_orders_table';
import { up as createOrderItems } from '../../src/infrastructure/database/migrations/002_create_order_items_table';
import { up as createSagaSteps } from '../../src/infrastructure/database/migrations/003_create_saga_steps_table';
import { up as createOutbox } from '../../src/infrastructure/database/migrations/004_create_outbox_events_table';

import { KnexInventoryRepository } from '../../../inventory-service/src/infrastructure/repositories/KnexInventoryRepository';
import { ReserveStockHandler } from '../../../inventory-service/src/application/handlers/ReserveStockHandler';
import { ReleaseStockHandler } from '../../../inventory-service/src/application/handlers/ReleaseStockHandler';
import { InventoryEventHandlers } from '../../../inventory-service/src/interfaces/messaging/eventHandlers';
import { up as createProducts } from '../../../inventory-service/src/infrastructure/database/migrations/001_create_products_table';
import { up as createInventory } from '../../../inventory-service/src/infrastructure/database/migrations/002_create_inventory_table';
import { up as createReservations } from '../../../inventory-service/src/infrastructure/database/migrations/003_create_reservations_table';

import { KnexPaymentRepository } from '../../../payment-service/src/infrastructure/repositories/KnexPaymentRepository';
import { PaymentGatewayClient } from '../../../payment-service/src/infrastructure/external/PaymentGatewayClient';
import { CircuitBreaker } from '../../../payment-service/src/infrastructure/resilience/CircuitBreaker';
import { ProcessPaymentHandler } from '../../../payment-service/src/application/handlers/ProcessPaymentHandler';
import { PaymentEventHandlers } from '../../../payment-service/src/interfaces/messaging/eventHandlers';
import { up as createPayments } from '../../../payment-service/src/infrastructure/database/migrations/001_create_payments_table';
import { up as createRefunds } from '../../../payment-service/src/infrastructure/database/migrations/002_create_refunds_table';
import { up as createPaymentEvents } from '../../../payment-service/src/infrastructure/database/migrations/003_create_payment_events_table';

/**
 * End-to-end saga tests wiring all three services' consumers in-process
 * against a real RabbitMQ broker and the three service databases. Gated
 * behind RUN_INTEGRATION_SAGA=1:
 *
 *   docker-compose up -d
 *   RUN_INTEGRATION_SAGA=1 npm test --workspace @nexuspay/order-service
 */
const SHOULD_RUN = process.env.RUN_INTEGRATION_SAGA === '1';
const describeSaga = SHOULD_RUN ? describe : describe.skip;

const logger = pino({ level: 'silent' });
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://nexuspay:nexuspay_dev@localhost:5672';
const ORDER_DB = process.env.ORDER_DB_URL ?? 'postgres://nexuspay:nexuspay_dev@localhost:5433/nexuspay_orders';
const INVENTORY_DB = process.env.INVENTORY_DB_URL ?? 'postgres://nexuspay:nexuspay_dev@localhost:5435/nexuspay_inventory';
const PAYMENT_DB = process.env.PAYMENT_DB_URL ?? 'postgres://nexuspay:nexuspay_dev@localhost:5434/nexuspay_payments';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describeSaga('Order saga (end to end)', () => {
  let connection: ChannelModel;
  let confirmChannel: ConfirmChannel;
  let channel: Channel;
  let orderDb: Knex;
  let inventoryDb: Knex;
  let paymentDb: Knex;

  let orderRepo: KnexOrderRepository;
  let outboxRepo: KnexOutboxRepository;
  let createOrder: CreateOrderHandler;
  let poller: OutboxPoller;

  // The payment gateway failure rate is swapped per scenario.
  let gatewayFailureRate = 0;

  const PRODUCT = { id: randomUUID(), sku: 'SAGA-SKU', price: '50.00' };

  beforeAll(async () => {
    connection = await amqp.connect(RABBIT_URL);
    confirmChannel = await connection.createConfirmChannel();
    channel = await connection.createChannel();
    await channel.prefetch(10);
    await setupTopology(channel);

    orderDb = knex({ client: 'pg', connection: ORDER_DB, pool: { min: 1, max: 5 } });
    inventoryDb = knex({ client: 'pg', connection: INVENTORY_DB, pool: { min: 1, max: 5 } });
    paymentDb = knex({ client: 'pg', connection: PAYMENT_DB, pool: { min: 1, max: 5 } });

    await resetOrderSchema(orderDb);
    await resetInventorySchema(inventoryDb);
    await resetPaymentSchema(paymentDb);

    const publisher = new Publisher(confirmChannel, logger);

    // Order side
    orderRepo = new KnexOrderRepository(orderDb);
    outboxRepo = new KnexOutboxRepository(orderDb);
    const sagaSteps = new KnexSagaStepRepository(orderDb);
    createOrder = new CreateOrderHandler(orderRepo);
    poller = new OutboxPoller(outboxRepo, publisher, {
      intervalMs: 200,
      batchSize: 100,
      exchange: Exchanges.ORDER,
    });
    const orderHandlers = new OrderEventHandlers(orderRepo, sagaSteps);

    // Inventory side
    const inventoryRepo = new KnexInventoryRepository(inventoryDb);
    const inventoryHandlers = new InventoryEventHandlers(
      new ReserveStockHandler(inventoryRepo, 900),
      new ReleaseStockHandler(inventoryRepo),
      publisher,
    );

    // Payment side
    const paymentRepo = new KnexPaymentRepository(paymentDb);
    const gateway = new PaymentGatewayClient({
      get failureRate() {
        return gatewayFailureRate;
      },
      minLatencyMs: 0,
      maxLatencyMs: 0,
    } as unknown as { failureRate: number; minLatencyMs: number; maxLatencyMs: number });
    const breaker = new CircuitBreaker({ failureThreshold: 100, resetTimeoutMs: 1000 });
    const paymentHandlers = new PaymentEventHandlers(
      new ProcessPaymentHandler(paymentRepo, gateway, breaker, {
        maxAttempts: 1,
        baseDelayMs: 1,
        sleep: async () => undefined,
      }),
      publisher,
    );

    const consumer = new Consumer(channel, logger);
    await consumer.consume(Queues.INVENTORY_ORDER_EVENTS, inventoryHandlers.handle);
    await consumer.consume(Queues.PAYMENT_INVENTORY_EVENTS, paymentHandlers.handle);
    await consumer.consume(Queues.ORDER_PAYMENT_EVENTS, orderHandlers.handle);
    await consumer.consume(Queues.ORDER_INVENTORY_EVENTS, orderHandlers.handle);

    poller.start();
  });

  afterAll(async () => {
    poller?.stop();
    await channel?.close();
    await confirmChannel?.close();
    await connection?.close();
    await orderDb?.destroy();
    await inventoryDb?.destroy();
    await paymentDb?.destroy();
  });

  const resetOrderSchema = async (db: Knex) => {
    await db.schema.dropTableIfExists('outbox_events');
    await db.schema.dropTableIfExists('saga_steps');
    await db.schema.dropTableIfExists('order_items');
    await db.schema.dropTableIfExists('orders');
    await createOrders(db);
    await createOrderItems(db);
    await createSagaSteps(db);
    await createOutbox(db);
  };

  const resetInventorySchema = async (db: Knex) => {
    await db.schema.dropTableIfExists('reservations');
    await db.schema.dropTableIfExists('inventory');
    await db.schema.dropTableIfExists('products');
    await createProducts(db);
    await createInventory(db);
    await createReservations(db);
  };

  const resetPaymentSchema = async (db: Knex) => {
    await db.schema.dropTableIfExists('payment_events');
    await db.schema.dropTableIfExists('refunds');
    await db.schema.dropTableIfExists('payments');
    await createPayments(db);
    await createRefunds(db);
    await createPaymentEvents(db);
  };

  const seedStock = async (availableQty: number) => {
    await inventoryDb('reservations').del();
    await inventoryDb('inventory').del();
    await inventoryDb('products').del();
    await inventoryDb('products').insert({
      id: PRODUCT.id,
      sku: PRODUCT.sku,
      name: 'Saga Product',
      price: PRODUCT.price,
      currency: 'USD',
    });
    await inventoryDb('inventory').insert({
      product_id: PRODUCT.id,
      sku: PRODUCT.sku,
      available_qty: availableQty,
    });
  };

  const placeOrder = async () => {
    const result = await createOrder.execute({
      customerId: randomUUID(),
      idempotencyKey: randomUUID(),
      currency: 'USD',
      items: [{ productId: PRODUCT.id, sku: PRODUCT.sku, quantity: 1, unitPrice: 50 }],
      shippingAddress: { line1: '1 St', city: 'SF', zip: '94102', country: 'US' },
    });
    return result.order.id;
  };

  const waitForStatus = async (orderId: string, status: OrderStatus, timeoutMs = 15000) => {
    const start = Date.now();
    for (;;) {
      const order = await orderRepo.findById(orderId);
      if (order?.status === status) return order;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Order ${orderId} did not reach ${status} (was ${order?.status})`);
      }
      await wait(150);
    }
  };

  it('happy path: order is confirmed after reservation and payment', async () => {
    gatewayFailureRate = 0;
    await seedStock(5);

    const orderId = await placeOrder();
    const order = await waitForStatus(orderId, OrderStatus.CONFIRMED);

    expect(order.status).toBe(OrderStatus.CONFIRMED);

    const stock = await inventoryDb('inventory').where({ sku: PRODUCT.sku }).first();
    expect(stock.reserved_qty).toBe(1);

    const payment = await paymentDb('payments').where({ order_id: orderId }).first();
    expect(payment.status).toBe('COMPLETED');
  });
});
