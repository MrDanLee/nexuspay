import { Money, ValidationError } from '@nexuspay/shared';

export interface ProductProps {
  id?: string;
  sku: string;
  name: string;
  description?: string;
  price: Money;
}

/**
 * Product catalog entry.
 *
 * A thin aggregate that owns its identity (SKU) and price. Stock levels
 * live on the separate Inventory aggregate so that high-frequency
 * reservation writes never contend with catalog updates.
 */
export class Product {
  readonly id?: string;
  readonly sku: string;
  readonly name: string;
  readonly description?: string;
  readonly price: Money;

  constructor(props: ProductProps) {
    if (!props.sku) {
      throw new ValidationError('Product SKU is required');
    }
    if (!props.name) {
      throw new ValidationError('Product name is required');
    }
    if (!props.price.isPositive()) {
      throw new ValidationError(`Product price must be positive, got ${props.price.toString()}`);
    }

    this.id = props.id;
    this.sku = props.sku;
    this.name = props.name;
    this.description = props.description;
    this.price = props.price;
  }
}
