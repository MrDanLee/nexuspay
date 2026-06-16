export interface ReserveStockCommand {
  orderId: string;
  items: Array<{
    sku: string;
    quantity: number;
  }>;
}
