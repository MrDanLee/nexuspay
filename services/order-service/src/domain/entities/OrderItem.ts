import { Money } from '@nexuspay/shared';

export interface OrderItemProps {
  id?: string;
  productId: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}

/**
 * An individual line item within an order.
 *
 * Validates quantity and calculates total price.
 * Immutable after creation — changes require a new order.
 */
export class OrderItem {
  readonly id?: string;
  readonly productId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly totalPrice: Money;

  constructor(props: OrderItemProps) {
    if (props.quantity <= 0) {
      throw new Error(`Quantity must be positive, got ${props.quantity}`);
    }

    if (!props.unitPrice.isPositive()) {
      throw new Error(`Unit price must be positive, got ${props.unitPrice.toString()}`);
    }

    this.id = props.id;
    this.productId = props.productId;
    this.sku = props.sku;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.totalPrice = props.unitPrice.multiply(props.quantity);
  }
}