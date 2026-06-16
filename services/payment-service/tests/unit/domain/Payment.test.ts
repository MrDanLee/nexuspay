import { Money, ValidationError, ConflictError } from '@nexuspay/shared';

import { Payment } from '../../../src/domain/entities/Payment';
import { PaymentStatus } from '../../../src/domain/value-objects/PaymentStatus';

const createPayment = (overrides = {}) =>
  new Payment({
    orderId: 'order-1',
    customerId: 'cust-1',
    amount: Money.of(100, 'USD'),
    idempotencyKey: 'idem-1',
    ...overrides,
  });

describe('Payment', () => {
  describe('creation', () => {
    it('creates a pending payment', () => {
      const payment = createPayment();
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.version).toBe(1);
      expect(payment.amount.toFixed()).toBe('100.00');
    });

    it('throws without an order id', () => {
      expect(() => createPayment({ orderId: '' })).toThrow(ValidationError);
    });

    it('throws without an idempotency key', () => {
      expect(() => createPayment({ idempotencyKey: '' })).toThrow(ValidationError);
    });

    it('throws for a non-positive amount', () => {
      expect(() => createPayment({ amount: Money.of(0, 'USD') })).toThrow(ValidationError);
    });
  });

  describe('state transitions', () => {
    it('moves through the happy path to COMPLETED', () => {
      const payment = createPayment();

      payment.markProcessing();
      expect(payment.status).toBe(PaymentStatus.PROCESSING);

      payment.markCompleted('txn-123');
      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.gatewayTransactionId).toBe('txn-123');
      expect(payment.version).toBe(3);
    });

    it('can fail from PENDING and from PROCESSING', () => {
      const fromPending = createPayment();
      fromPending.markFailed('card declined');
      expect(fromPending.status).toBe(PaymentStatus.FAILED);
      expect(fromPending.failureReason).toBe('card declined');

      const fromProcessing = createPayment();
      fromProcessing.markProcessing();
      fromProcessing.markFailed('gateway timeout');
      expect(fromProcessing.status).toBe(PaymentStatus.FAILED);
    });

    it('refunds a completed payment', () => {
      const payment = createPayment();
      payment.markProcessing();
      payment.markCompleted('txn-1');
      payment.requestRefund();
      expect(payment.status).toBe(PaymentStatus.REFUND_PENDING);

      payment.markRefunded('rf-1');
      expect(payment.status).toBe(PaymentStatus.REFUNDED);
    });

    it('rejects skipping PROCESSING (PENDING -> COMPLETED)', () => {
      const payment = createPayment();
      expect(() => payment.markCompleted('txn-1')).toThrow(ConflictError);
    });

    it('rejects refunding a payment that is not completed', () => {
      const payment = createPayment();
      expect(() => payment.requestRefund()).toThrow(ConflictError);
    });

    it('rejects transitions out of terminal states', () => {
      const payment = createPayment();
      payment.markFailed('declined');
      expect(payment.isTerminal()).toBe(true);
      expect(() => payment.markProcessing()).toThrow(ConflictError);
    });
  });

  describe('recorded events', () => {
    it('records an event per transition and clears on pull', () => {
      const payment = createPayment();
      payment.markProcessing();
      payment.markCompleted('txn-9');

      const events = payment.pullEvents();
      expect(events.map((e) => e.eventType)).toEqual([
        'payment.processing',
        'payment.completed',
      ]);
      expect(events[1]?.payload).toEqual({ gatewayTransactionId: 'txn-9' });

      // Second pull is empty.
      expect(payment.pullEvents()).toHaveLength(0);
    });

    it('records from/to status on each event', () => {
      const payment = createPayment();
      payment.markProcessing();

      const [event] = payment.pullEvents();
      expect(event).toMatchObject({
        fromStatus: PaymentStatus.PENDING,
        toStatus: PaymentStatus.PROCESSING,
      });
    });
  });
});
