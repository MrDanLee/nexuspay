export interface CreateOrderCommand {
  customerId: string;
  idempotencyKey: string;
  currency: string;
  items: Array<{
    productId: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }>;
  shippingAddress: {
    line1: string;
    city: string;
    state?: string;
    zip: string;
    country: string;
  };
}