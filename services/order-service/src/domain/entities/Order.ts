import { Money, ConflictError, ValidationError } from '@nexuspay/shared';

import { OrderStatus, canTransition, isCancellable, isTerminal } from '../value-objects/OrderStatus';

import { OrderItem, OrderItemProps } from './OrderItem';

export interface OrderProps {
  id?: string;
  customerId: string;
  items: OrderItemProps[];
  currency: string;
  idempotencyKey: string;
  shippingAddress?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: OrderStatus;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Order aggregate root.
 *
 * This is a rich domain model — it contains business rules and
 * validates its own invariants. It is NOT an anemic data container.
 *
 * Key invariants:
 * - Must have at least one item
 * - Status transitions follow the state machine
 * - Version is incremented on every state change (optimistic locking)
 * - Total amount is always consistent with items
 */
export class Order {
  readonly id?: string;
  readonly customerId: string;
  readonly items: OrderItem[];
  readonly totalAmount: Money;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly shippingAddress: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  private _status: OrderStatus;
  private _version: number;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: OrderProps) {
    if (!props.items || props.items.length === 0) {
      throw new ValidationError('Order must have at least one item');
    }

    if (!props.customerId) {
      throw new ValidationError('Customer ID is required');
    }

    if (!props.idempotencyKey) {
      throw new ValidationError('Idempotency key is required');
    }

    this.id = props.id;
    this.customerId = props.customerId;
    this.currency = props.currency || 'USD';
    this.idempotencyKey = props.idempotencyKey;
    this.shippingAddress = props.shippingAddress ?? {};
    this.metadata = props.metadata ?? {};
    this._status = props.status ?? OrderStatus.CREATED;
    this._version = props.version ?? 1;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();

    // Create order items and calculate total
    this.items = props.items.map((item) => new OrderItem({
      ...item,
      unitPrice: item.unitPrice instanceof Money
        ? item.unitPrice
        : Money.of(item.unitPrice as unknown as number, this.currency),
    }));

    this.totalAmount = this.items.reduce(
      (sum, item) => sum.add(item.totalPrice),
      Money.zero(this.currency),
    );
  }

  // ─── Getters ────────────────────────────────────

  get status(): OrderStatus {
    return this._status;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ─── State Transitions ──────────────────────────

  /**
   * Transition to a new status.
   * Validates the transition is allowed by the state machine.
   * Increments version for optimistic locking.
   */
  transitionTo(newStatus: OrderStatus): void {
    if (!canTransition(this._status, newStatus)) {
      throw new ConflictError(
        `Cannot transition order from ${this._status} to ${newStatus}`,
        {
          metadata: {
            currentStatus: this._status,
            requestedStatus: newStatus,
            orderId: this.id,
          },
        },
      );
    }

    this._status = newStatus;
    this._version += 1;
    this._updatedAt = new Date();
  }

  /**
   * Cancel the order if it's in a cancellable state.
   */
  cancel(): void {
    if (!isCancellable(this._status)) {
      throw new ConflictError(
        `Order in status ${this._status} cannot be cancelled`,
        { metadata: { orderId: this.id, currentStatus: this._status } },
      );
    }

    this.transitionTo(OrderStatus.CANCELLED);
  }

  /**
   * Check if the order is in a terminal (final) state.
   */
  isTerminal(): boolean {
    return isTerminal(this._status);
  }

  /**
   * Check if the order can be cancelled.
   */
  isCancellable(): boolean {
    return isCancellable(this._status);
  }
}