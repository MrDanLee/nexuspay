export interface ProcessPaymentCommand {
  orderId: string;
  customerId?: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}
