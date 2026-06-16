import { Money, ConflictError, ValidationError } from '@nexuspay/shared';

import { PaymentStatus, canTransition, isTerminal } from '../value-objects/PaymentStatus';

export interface RecordedPaymentEvent {
  eventType: string;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  payload: Record<string, unknown>;
}

export interface PaymentProps {
  id?: string;
  orderId: string;
  customerId?: string;
  amount: Money;
  idempotencyKey: string;
  status?: PaymentStatus;
  gatewayTransactionId?: string;
  failureReason?: string;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Payment aggregate root.
 *
 * A rich domain model that owns the payment state machine and records a
 * domain event on every transition. The repository persists those events
 * to the append-only payment_events table ("event sourcing light"), so a
 * payment's full timeline can be reconstructed for audit and debugging.
 */
export class Payment {
  readonly id?: string;
  readonly orderId: string;
  readonly customerId?: string;
  readonly amount: Money;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  private _status: PaymentStatus;
  private _gatewayTransactionId?: string;
  private _failureReason?: string;
  private _version: number;
  private _updatedAt: Date;
  private _events: RecordedPaymentEvent[] = [];

  constructor(props: PaymentProps) {
    if (!props.orderId) {
      throw new ValidationError('Order ID is required');
    }
    if (!props.idempotencyKey) {
      throw new ValidationError('Idempotency key is required');
    }
    if (!props.amount.isPositive()) {
      throw new ValidationError(`Payment amount must be positive, got ${props.amount.toString()}`);
    }

    this.id = props.id;
    this.orderId = props.orderId;
    this.customerId = props.customerId;
    this.amount = props.amount;
    this.idempotencyKey = props.idempotencyKey;
    this._status = props.status ?? PaymentStatus.PENDING;
    this._gatewayTransactionId = props.gatewayTransactionId;
    this._failureReason = props.failureReason;
    this._version = props.version ?? 1;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  get status(): PaymentStatus {
    return this._status;
  }

  get gatewayTransactionId(): string | undefined {
    return this._gatewayTransactionId;
  }

  get failureReason(): string | undefined {
    return this._failureReason;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ─── State transitions ──────────────────────────

  markProcessing(): void {
    this.transitionTo(PaymentStatus.PROCESSING, 'payment.processing', {});
  }

  markCompleted(gatewayTransactionId: string): void {
    this._gatewayTransactionId = gatewayTransactionId;
    this.transitionTo(PaymentStatus.COMPLETED, 'payment.completed', { gatewayTransactionId });
  }

  markFailed(reason: string): void {
    this._failureReason = reason;
    this.transitionTo(PaymentStatus.FAILED, 'payment.failed', { reason });
  }

  requestRefund(): void {
    this.transitionTo(PaymentStatus.REFUND_PENDING, 'payment.refund_pending', {});
  }

  markRefunded(gatewayRefundId: string): void {
    this.transitionTo(PaymentStatus.REFUNDED, 'payment.refunded', { gatewayRefundId });
  }

  isTerminal(): boolean {
    return isTerminal(this._status);
  }

  /**
   * Pull and clear the events recorded since the last pull. The repository
   * calls this to append them to the payment_events table.
   */
  pullEvents(): RecordedPaymentEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  private transitionTo(
    newStatus: PaymentStatus,
    eventType: string,
    payload: Record<string, unknown>,
  ): void {
    if (!canTransition(this._status, newStatus)) {
      throw new ConflictError(
        `Cannot transition payment from ${this._status} to ${newStatus}`,
        {
          metadata: {
            paymentId: this.id,
            currentStatus: this._status,
            requestedStatus: newStatus,
          },
        },
      );
    }

    this._events.push({
      eventType,
      fromStatus: this._status,
      toStatus: newStatus,
      payload,
    });
    this._status = newStatus;
    this._version += 1;
    this._updatedAt = new Date();
  }
}
