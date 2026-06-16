import { randomUUID } from 'node:crypto';
import knex, { Knex } from 'knex';

import { PaymentStatus } from '../../src/domain/value-objects/PaymentStatus';
import { KnexPaymentRepository } from '../../src/infrastructure/repositories/KnexPaymentRepository';
import { KnexRefundRepository } from '../../src/infrastructure/repositories/KnexRefundRepository';
import { PaymentGatewayClient } from '../../src/infrastructure/external/PaymentGatewayClient';
import { CircuitBreaker } from '../../src/infrastructure/resilience/CircuitBreaker';
import { ProcessPaymentHandler } from '../../src/application/handlers/ProcessPaymentHandler';
import { RefundHandler } from '../../src/application/handlers/RefundHandler';
import { up as createPayments } from '../../src/infrastructure/database/migrations/001_create_payments_table';
import { up as createRefunds } from '../../src/infrastructure/database/migrations/002_create_refunds_table';
import { up as createPaymentEvents } from '../../src/infrastructure/database/migrations/003_create_payment_events_table';

/**
 * Full payment lifecycle against real PostgreSQL, covering the Knex
 * repository and event-sourcing-light timeline. Gated behind
 * RUN_INTEGRATION_DB=1 so the default test run stays green without Docker:
 *
 *   docker-compose up -d postgres-payments
 *   RUN_INTEGRATION_DB=1 npm test --workspace @nexuspay/payment-service
 */
const SHOULD_RUN = process.env.RUN_INTEGRATION_DB === '1';
const describeDb = SHOULD_RUN ? describe : describe.skip;

const DB_URL =
  process.env.PAYMENT_DB_URL ??
  'postgres://nexuspay:nexuspay_dev@localhost:5434/nexuspay_payments';

const noSleep = async (): Promise<void> => undefined;

describeDb('Payment flow (PostgreSQL)', () => {
  let db: Knex;
  let payments: KnexPaymentRepository;
  let refunds: KnexRefundRepository;
  let processHandler: ProcessPaymentHandler;
  let refundHandler: RefundHandler;

  beforeAll(async () => {
    db = knex({ client: 'pg', connection: DB_URL, pool: { min: 1, max: 5 } });
    await db.schema.dropTableIfExists('payment_events');
    await db.schema.dropTableIfExists('refunds');
    await db.schema.dropTableIfExists('payments');
    await createPayments(db);
    await createRefunds(db);
    await createPaymentEvents(db);

    payments = new KnexPaymentRepository(db);
    refunds = new KnexRefundRepository(db);
    // failureRate 0 + zero latency => the gateway always succeeds instantly.
    const gateway = new PaymentGatewayClient({ failureRate: 0, minLatencyMs: 0, maxLatencyMs: 0 });
    const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 1000 });
    processHandler = new ProcessPaymentHandler(payments, gateway, breaker, {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: noSleep,
    });
    refundHandler = new RefundHandler(payments, refunds, gateway, {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: noSleep,
    });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  beforeEach(async () => {
    await db('payment_events').del();
    await db('refunds').del();
    await db('payments').del();
  });

  const newCommand = () => ({
    orderId: randomUUID(),
    customerId: randomUUID(),
    amount: 100,
    currency: 'USD',
    idempotencyKey: randomUUID(),
  });

  it('processes a payment to COMPLETED and records its events', async () => {
    const result = await processHandler.execute(newCommand());

    expect(result.success).toBe(true);
    expect(result.payment.status).toBe(PaymentStatus.COMPLETED);

    const events = await db('payment_events')
      .where({ payment_id: result.payment.id })
      .orderBy('created_at');
    expect(events.map((e) => e.event_type)).toEqual([
      'payment.processing',
      'payment.completed',
    ]);
  });

  it('is idempotent for a duplicate idempotency key', async () => {
    const command = newCommand();
    const first = await processHandler.execute(command);
    const second = await processHandler.execute(command);

    expect(second.payment.id).toBe(first.payment.id);
    const rows = await db('payments').count<{ count: string }[]>('* as count');
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('refunds a completed payment and records the refund', async () => {
    const completed = await processHandler.execute(newCommand());

    const result = await refundHandler.execute({
      paymentId: completed.payment.id as string,
      idempotencyKey: randomUUID(),
      reason: 'customer request',
    });

    expect(result.payment.status).toBe(PaymentStatus.REFUNDED);
    expect(result.refund.status).toBe('COMPLETED');

    const refundRows = await db('refunds').where({ payment_id: completed.payment.id });
    expect(refundRows).toHaveLength(1);

    const events = await db('payment_events')
      .where({ payment_id: completed.payment.id })
      .orderBy('created_at');
    expect(events.map((e) => e.event_type)).toEqual([
      'payment.processing',
      'payment.completed',
      'payment.refund_pending',
      'payment.refunded',
    ]);
  });

  it('is idempotent for a duplicate refund idempotency key', async () => {
    const completed = await processHandler.execute(newCommand());
    const refundKey = randomUUID();

    const first = await refundHandler.execute({
      paymentId: completed.payment.id as string,
      idempotencyKey: refundKey,
    });
    const second = await refundHandler.execute({
      paymentId: completed.payment.id as string,
      idempotencyKey: refundKey,
    });

    expect(second.refund.id).toBe(first.refund.id);
    const refundRows = await db('refunds').where({ payment_id: completed.payment.id });
    expect(refundRows).toHaveLength(1);
  });
});
