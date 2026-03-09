import { Money, ValidationError, ConflictError } from '@nexuspay/shared';

import { Order } from '../../../src/domain/entities/Order';
import { OrderStatus } from '../../../src/domain/value-objects/OrderStatus';

const createValidProps = (overrides = {}) => ({
  customerId: 'cust-123',
  idempotencyKey: 'idem-456',
  currency: 'USD',
  items: [
    {
      productId: 'prod-1',
      sku: 'LAPTOP-PRO-15',
      quantity: 1,
      unitPrice: Money.of(999.99, 'USD'),
    },
    {
      productId: 'prod-2',
      sku: 'USB-C-CABLE',
      quantity: 2,
      unitPrice: Money.of(19.99, 'USD'),
    },
  ],
  ...overrides,
});

describe('Order', () => {
  describe('creation', () => {
    it('should create a valid order with correct total', () => {
      const order = new Order(createValidProps());

      expect(order.status).toBe(OrderStatus.CREATED);
      expect(order.customerId).toBe('cust-123');
      expect(order.items).toHaveLength(2);
      expect(order.totalAmount.toFixed()).toBe('1039.97');
      expect(order.version).toBe(1);
    });

    it('should throw when no items provided', () => {
      expect(() => new Order(createValidProps({ items: [] }))).toThrow(
        ValidationError,
      );
    });

    it('should throw when customerId is missing', () => {
      expect(() => new Order(createValidProps({ customerId: '' }))).toThrow(
        ValidationError,
      );
    });

    it('should throw when idempotencyKey is missing', () => {
      expect(
        () => new Order(createValidProps({ idempotencyKey: '' })),
      ).toThrow(ValidationError);
    });

    it('should throw when item quantity is zero', () => {
      expect(
        () =>
          new Order(
            createValidProps({
              items: [
                {
                  productId: 'prod-1',
                  sku: 'TEST',
                  quantity: 0,
                  unitPrice: Money.of(10, 'USD'),
                },
              ],
            }),
          ),
      ).toThrow('Quantity must be positive');
    });

    it('should throw when item quantity is negative', () => {
      expect(
        () =>
          new Order(
            createValidProps({
              items: [
                {
                  productId: 'prod-1',
                  sku: 'TEST',
                  quantity: -1,
                  unitPrice: Money.of(10, 'USD'),
                },
              ],
            }),
          ),
      ).toThrow('Quantity must be positive');
    });

    it('should default to CREATED status', () => {
      const order = new Order(createValidProps());
      expect(order.status).toBe(OrderStatus.CREATED);
    });

    it('should default currency to USD', () => {
      const order = new Order(createValidProps({ currency: undefined }));
      expect(order.currency).toBe('USD');
    });
  });

  describe('status transitions', () => {
    it('should transition from CREATED to INVENTORY_RESERVED', () => {
      const order = new Order(createValidProps());
      order.transitionTo(OrderStatus.INVENTORY_RESERVED);

      expect(order.status).toBe(OrderStatus.INVENTORY_RESERVED);
      expect(order.version).toBe(2);
    });

    it('should transition through full happy path', () => {
      const order = new Order(createValidProps());

      order.transitionTo(OrderStatus.INVENTORY_RESERVED);
      expect(order.status).toBe(OrderStatus.INVENTORY_RESERVED);

      order.transitionTo(OrderStatus.PAYMENT_PENDING);
      expect(order.status).toBe(OrderStatus.PAYMENT_PENDING);

      order.transitionTo(OrderStatus.CONFIRMED);
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.version).toBe(4);
    });

    it('should reject invalid transition', () => {
      const order = new Order(createValidProps());

      expect(() => order.transitionTo(OrderStatus.CONFIRMED)).toThrow(
        ConflictError,
      );
    });

    it('should reject transition from terminal state', () => {
      const order = new Order(
        createValidProps({ status: OrderStatus.CONFIRMED }),
      );

      expect(() => order.transitionTo(OrderStatus.CANCELLED)).toThrow(
        ConflictError,
      );
    });

    it('should increment version on each transition', () => {
      const order = new Order(createValidProps());
      expect(order.version).toBe(1);

      order.transitionTo(OrderStatus.INVENTORY_RESERVED);
      expect(order.version).toBe(2);

      order.transitionTo(OrderStatus.PAYMENT_PENDING);
      expect(order.version).toBe(3);
    });

    it('should update updatedAt on transition', () => {
      const order = new Order(createValidProps());
      const beforeTransition = order.updatedAt;

      // Small delay to ensure timestamp changes
      order.transitionTo(OrderStatus.INVENTORY_RESERVED);

      expect(order.updatedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTransition.getTime(),
      );
    });
  });

  describe('cancellation', () => {
    it('should cancel a CREATED order', () => {
      const order = new Order(createValidProps());
      order.cancel();

      expect(order.status).toBe(OrderStatus.CANCELLED);
    });

    it('should cancel an INVENTORY_RESERVED order', () => {
      const order = new Order(createValidProps());
      order.transitionTo(OrderStatus.INVENTORY_RESERVED);
      order.cancel();

      expect(order.status).toBe(OrderStatus.CANCELLED);
    });

    it('should not cancel a CONFIRMED order', () => {
      const order = new Order(
        createValidProps({ status: OrderStatus.CONFIRMED }),
      );

      expect(() => order.cancel()).toThrow(ConflictError);
    });

    it('should not cancel an already CANCELLED order', () => {
      const order = new Order(
        createValidProps({ status: OrderStatus.CANCELLED }),
      );

      expect(() => order.cancel()).toThrow(ConflictError);
    });
  });

  describe('terminal state', () => {
    it('should detect terminal states', () => {
      const confirmed = new Order(
        createValidProps({ status: OrderStatus.CONFIRMED }),
      );
      const cancelled = new Order(
        createValidProps({ status: OrderStatus.CANCELLED }),
      );
      const expired = new Order(
        createValidProps({ status: OrderStatus.EXPIRED }),
      );

      expect(confirmed.isTerminal()).toBe(true);
      expect(cancelled.isTerminal()).toBe(true);
      expect(expired.isTerminal()).toBe(true);
    });

    it('should detect non-terminal states', () => {
      const created = new Order(createValidProps());
      expect(created.isTerminal()).toBe(false);
    });
  });

  describe('cancellability', () => {
    it('should report CREATED as cancellable', () => {
      const order = new Order(createValidProps());
      expect(order.isCancellable()).toBe(true);
    });

    it('should report CONFIRMED as not cancellable', () => {
      const order = new Order(
        createValidProps({ status: OrderStatus.CONFIRMED }),
      );
      expect(order.isCancellable()).toBe(false);
    });
  });
});