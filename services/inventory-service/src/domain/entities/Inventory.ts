import { ValidationError, ConflictError } from '@nexuspay/shared';

export interface InventoryProps {
  id?: string;
  productId: string;
  sku: string;
  availableQty: number;
  reservedQty?: number;
  version?: number;
}

/**
 * Inventory aggregate for a single SKU.
 *
 * Tracks two counters:
 * - availableQty: units that can still be reserved
 * - reservedQty:  units held by active reservations, not yet shipped
 *
 * The invariant `availableQty >= 0 && reservedQty >= 0` is enforced on
 * every mutation. Reserving moves units from available to reserved;
 * releasing moves them back. The version column supports optimistic
 * locking at the repository layer.
 */
export class Inventory {
  readonly id?: string;
  readonly productId: string;
  readonly sku: string;
  private _availableQty: number;
  private _reservedQty: number;
  private _version: number;

  constructor(props: InventoryProps) {
    if (!props.sku) {
      throw new ValidationError('Inventory SKU is required');
    }
    if (!Number.isInteger(props.availableQty) || props.availableQty < 0) {
      throw new ValidationError(
        `availableQty must be a non-negative integer, got ${props.availableQty}`,
      );
    }
    const reserved = props.reservedQty ?? 0;
    if (!Number.isInteger(reserved) || reserved < 0) {
      throw new ValidationError(`reservedQty must be a non-negative integer, got ${reserved}`);
    }

    this.id = props.id;
    this.productId = props.productId;
    this.sku = props.sku;
    this._availableQty = props.availableQty;
    this._reservedQty = reserved;
    this._version = props.version ?? 1;
  }

  get availableQty(): number {
    return this._availableQty;
  }

  get reservedQty(): number {
    return this._reservedQty;
  }

  get totalQty(): number {
    return this._availableQty + this._reservedQty;
  }

  get version(): number {
    return this._version;
  }

  /**
   * Reserve `quantity` units, moving them from available to reserved.
   * @throws ValidationError if quantity is not a positive integer
   * @throws ConflictError (409) if there is insufficient available stock
   */
  reserve(quantity: number): void {
    this.assertPositiveInteger(quantity);

    if (quantity > this._availableQty) {
      throw new ConflictError(`Insufficient stock for SKU ${this.sku}`, {
        metadata: {
          sku: this.sku,
          requested: quantity,
          available: this._availableQty,
        },
      });
    }

    this._availableQty -= quantity;
    this._reservedQty += quantity;
    this._version += 1;
  }

  /**
   * Release `quantity` reserved units back to available.
   * @throws ValidationError if quantity is invalid or exceeds reserved stock
   */
  release(quantity: number): void {
    this.assertPositiveInteger(quantity);

    if (quantity > this._reservedQty) {
      throw new ValidationError(
        `Cannot release ${quantity} units for SKU ${this.sku}; only ${this._reservedQty} reserved`,
      );
    }

    this._availableQty += quantity;
    this._reservedQty -= quantity;
    this._version += 1;
  }

  private assertPositiveInteger(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError(`Quantity must be a positive integer, got ${quantity}`);
    }
  }
}
