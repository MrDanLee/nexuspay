export interface CancelOrderCommand {
  orderId: string;
  customerId: string;
  reason?: string;
}