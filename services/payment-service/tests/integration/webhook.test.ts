import { randomUUID } from 'node:crypto';

import { Money, requestIdMiddleware, errorHandlerMiddleware } from '@nexuspay/shared';
import express, { Application } from 'express';
import pino from 'pino';
import supertest from 'supertest';

import { ProcessWebhookHandler } from '../../src/application/handlers/ProcessWebhookHandler';
import { PaymentRepository } from '../../src/application/ports/PaymentRepository';
import { Payment } from '../../src/domain/entities/Payment';
import { PaymentStatus } from '../../src/domain/value-objects/PaymentStatus';
import { signPayload } from '../../src/infrastructure/security/webhookSignature';
import { WebhookController } from '../../src/interfaces/http/controllers/WebhookController';
import { createWebhookRoutes } from '../../src/interfaces/http/routes/webhookRoutes';

const SECRET = 'test-webhook-secret';

class FakePaymentRepository implements PaymentRepository {
  private readonly byId = new Map<string, Payment>();

  private rehydrate(p: Payment, id: string): Payment {
    return new Payment({
      id,
      orderId: p.orderId,
      amount: p.amount,
      idempotencyKey: p.idempotencyKey,
      status: p.status,
      gatewayTransactionId: p.gatewayTransactionId,
      failureReason: p.failureReason,
      version: p.version,
    });
  }

  seedProcessing(): string {
    const id = randomUUID();
    const payment = new Payment({
      id,
      orderId: randomUUID(),
      amount: Money.of(100, 'USD'),
      idempotencyKey: `idem-${id}`,
    });
    payment.markProcessing();
    this.byId.set(id, this.rehydrate(payment, id));
    return id;
  }

  async findById(id: string): Promise<Payment | null> {
    return this.byId.get(id) ?? null;
  }
  async findByOrderId(): Promise<Payment | null> {
    return null;
  }
  async findByIdempotencyKey(): Promise<Payment | null> {
    return null;
  }
  async save(payment: Payment): Promise<Payment> {
    return payment;
  }
  async update(payment: Payment): Promise<Payment> {
    const stored = this.rehydrate(payment, payment.id as string);
    this.byId.set(payment.id as string, stored);
    return stored;
  }
}

function buildApp(repo: PaymentRepository): Application {
  const logger = pino({ level: 'silent' });
  const controller = new WebhookController(new ProcessWebhookHandler(repo), SECRET);
  const app = express();
  app.use(requestIdMiddleware());
  app.use('/webhooks', createWebhookRoutes(controller));
  app.use(errorHandlerMiddleware(logger));
  return app;
}

const post = (app: Application, body: object, signature?: string) => {
  const payload = JSON.stringify(body);
  const sig = signature ?? signPayload(payload, SECRET);
  return supertest(app)
    .post('/webhooks/payment')
    .set('Content-Type', 'application/json')
    .set('x-webhook-signature', sig)
    .send(payload);
};

describe('Payment webhook', () => {
  let app: Application;
  let repo: FakePaymentRepository;
  let paymentId: string;

  beforeEach(() => {
    repo = new FakePaymentRepository();
    paymentId = repo.seedProcessing();
    app = buildApp(repo);
  });

  it('accepts a valid signature and completes the payment', async () => {
    const res = await post(app, {
      id: 'evt-1',
      type: 'payment.succeeded',
      data: { paymentId, gatewayTransactionId: 'txn-9' },
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    const payment = await repo.findById(paymentId);
    expect(payment?.status).toBe(PaymentStatus.COMPLETED);
  });

  it('rejects an invalid signature with 401', async () => {
    const res = await post(
      app,
      { id: 'evt-2', type: 'payment.succeeded', data: { paymentId } },
      'deadbeef',
    );

    expect(res.status).toBe(401);
    const payment = await repo.findById(paymentId);
    expect(payment?.status).toBe(PaymentStatus.PROCESSING);
  });

  it('is idempotent for a redelivered event', async () => {
    const body = {
      id: 'evt-3',
      type: 'payment.succeeded',
      data: { paymentId, gatewayTransactionId: 'txn-1' },
    };

    const first = await post(app, body);
    const second = await post(app, body);

    expect(first.body.applied).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.applied).toBe(false);
    const payment = await repo.findById(paymentId);
    expect(payment?.status).toBe(PaymentStatus.COMPLETED);
  });

  it('applies a payment.failed event', async () => {
    const res = await post(app, {
      id: 'evt-4',
      type: 'payment.failed',
      data: { paymentId, reason: 'insufficient funds' },
    });

    expect(res.status).toBe(200);
    const payment = await repo.findById(paymentId);
    expect(payment?.status).toBe(PaymentStatus.FAILED);
  });

  it('ignores an unknown event type', async () => {
    const res = await post(app, {
      id: 'evt-5',
      type: 'payment.disputed',
      data: { paymentId },
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(false);
    const payment = await repo.findById(paymentId);
    expect(payment?.status).toBe(PaymentStatus.PROCESSING);
  });
});
