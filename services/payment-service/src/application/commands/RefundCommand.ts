export interface RefundCommand {
  paymentId: string;
  idempotencyKey: string;
  reason?: string;
}
