import { ProcessPaymentHandler } from '../../../src/application/handlers/ProcessPaymentHandler';
import { PaymentRepository } from '../../../src/application/ports/PaymentRepository';
import { Payment } from '../../../src/domain/entities/Payment';
import { PaymentStatus } from '../../../src/domain/value-objects/PaymentStatus';
import {
  PaymentGatewayClient,
  GatewayError,
} from '../../../src/infrastructure/external/PaymentGatewayClient';
import { CircuitBreaker } from '../../../src/infrastructure/resilience/CircuitBreaker';

class FakePaymentRepository implements PaymentRepository {
  private readonly byId = new Map<string, Payment>();
  private seq = 0;

  private rehydrate(p: Payment, id: string): Payment {
    return new Payment({
      id,
      orderId: p.orderId,
      customerId: p.customerId,
      amount: p.amount,
      idempotencyKey: p.idempotencyKey,
      status: p.status,
      gatewayTransactionId: p.gatewayTransactionId,
      failureReason: p.failureReason,
      version: p.version,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }

  async findById(id: string): Promise<Payment | null> {
    return this.byId.get(id) ?? null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    for (const p of this.byId.values()) if (p.orderId === orderId) return p;
    return null;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    for (const p of this.byId.values()) if (p.idempotencyKey === key) return p;
    return null;
  }

  async save(payment: Payment): Promise<Payment> {
    const id = `pay-${++this.seq}`;
    const stored = this.rehydrate(payment, id);
    this.byId.set(id, stored);
    return stored;
  }

  async update(payment: Payment): Promise<Payment> {
    const id = payment.id as string;
    const stored = this.rehydrate(payment, id);
    this.byId.set(id, stored);
    return stored;
  }
}

const makeGateway = (charge: jest.Mock): PaymentGatewayClient =>
  ({ charge, refund: jest.fn() }) as unknown as PaymentGatewayClient;

const retryablePred = (e: unknown) => e instanceof GatewayError && e.retryable;
const noSleep = async (): Promise<void> => undefined;

const command = (overrides = {}) => ({
  orderId: 'order-1',
  customerId: 'cust-1',
  amount: 100,
  currency: 'USD',
  idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
  ...overrides,
});

const makeBreaker = (failureThreshold = 5) =>
  new CircuitBreaker({
    failureThreshold,
    resetTimeoutMs: 60_000,
    shouldCount: retryablePred,
    now: () => 1000,
  });

describe('ProcessPaymentHandler', () => {
  it('completes a payment on a successful charge', async () => {
    const repo = new FakePaymentRepository();
    const charge = jest.fn(async () => ({ transactionId: 'txn-1' }));
    const handler = new ProcessPaymentHandler(repo, makeGateway(charge), makeBreaker(), {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: noSleep,
    });

    const result = await handler.execute(command());

    expect(result.success).toBe(true);
    expect(result.payment.status).toBe(PaymentStatus.COMPLETED);
    expect(result.payment.gatewayTransactionId).toBe('txn-1');
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('retries a transient gateway failure then succeeds', async () => {
    const repo = new FakePaymentRepository();
    let calls = 0;
    const charge = jest.fn(async () => {
      calls += 1;
      if (calls < 3) throw new GatewayError('temporary', true, 503);
      return { transactionId: 'txn-ok' };
    });
    const handler = new ProcessPaymentHandler(repo, makeGateway(charge), makeBreaker(), {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: noSleep,
    });

    const result = await handler.execute(command());

    expect(result.success).toBe(true);
    expect(charge).toHaveBeenCalledTimes(3);
  });

  it('marks the payment FAILED when all retries are exhausted', async () => {
    const repo = new FakePaymentRepository();
    const charge = jest.fn(async () => {
      throw new GatewayError('still down', true, 503);
    });
    const handler = new ProcessPaymentHandler(repo, makeGateway(charge), makeBreaker(), {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: noSleep,
    });

    const result = await handler.execute(command());

    expect(result.success).toBe(false);
    expect(result.payment.status).toBe(PaymentStatus.FAILED);
    expect(charge).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable decline', async () => {
    const repo = new FakePaymentRepository();
    const charge = jest.fn(async () => {
      throw new GatewayError('Card declined', false, 402);
    });
    const handler = new ProcessPaymentHandler(repo, makeGateway(charge), makeBreaker(), {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: noSleep,
    });

    const result = await handler.execute(command());

    expect(result.success).toBe(false);
    expect(result.payment.status).toBe(PaymentStatus.FAILED);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('fails fast once the circuit breaker is open', async () => {
    const repo = new FakePaymentRepository();
    const charge = jest.fn(async () => {
      throw new GatewayError('down', true, 503);
    });
    // threshold 1: the first exhausted attempt opens the breaker.
    const handler = new ProcessPaymentHandler(repo, makeGateway(charge), makeBreaker(1), {
      maxAttempts: 2,
      baseDelayMs: 1,
      sleep: noSleep,
    });

    await handler.execute(command());
    const callsAfterFirst = charge.mock.calls.length;

    const second = await handler.execute(command());
    expect(second.success).toBe(false);
    expect(second.payment.failureReason).toBe('circuit_open');
    // Breaker is open, so the gateway is not hit again.
    expect(charge).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it('is idempotent for a duplicate idempotency key', async () => {
    const repo = new FakePaymentRepository();
    const charge = jest.fn(async () => ({ transactionId: 'txn-1' }));
    const handler = new ProcessPaymentHandler(repo, makeGateway(charge), makeBreaker(), {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: noSleep,
    });

    const cmd = command({ idempotencyKey: 'fixed-key' });
    const first = await handler.execute(cmd);
    const second = await handler.execute(cmd);

    expect(second.payment.id).toBe(first.payment.id);
    expect(charge).toHaveBeenCalledTimes(1);
  });
});
