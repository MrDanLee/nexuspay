import { z } from 'zod';

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid('orderId must be a valid UUID'),
});

export const paymentIdParamSchema = z.object({
  id: z.string().uuid('payment id must be a valid UUID'),
});

export const processPaymentSchema = z.object({
  amount: z.number().positive('amount must be positive'),
  currency: z.string().length(3, 'currency must be a 3-letter ISO 4217 code').default('USD'),
  customerId: z.string().uuid('customerId must be a valid UUID').optional(),
});

export const refundSchema = z.object({
  reason: z.string().max(200).optional(),
});

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
