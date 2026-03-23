import { z } from 'zod';

/**
 * Request validation schemas for order endpoints.
 *
 * Using Zod for runtime validation with automatic TypeScript
 * type inference. Invalid requests are rejected at the HTTP
 * layer before reaching the application layer.
 */
export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Product ID must be a valid UUID'),
        sku: z.string().min(1, 'SKU is required').max(50),
        quantity: z.number().int().positive('Quantity must be positive'),
        unitPrice: z.number().positive('Unit price must be positive'),
      }),
    )
    .min(1, 'At least one item is required')
    .max(50, 'Maximum 50 items per order'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO 4217 code').default('USD'),
  shippingAddress: z.object({
    line1: z.string().min(1, 'Address line 1 is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().optional(),
    zip: z.string().min(1, 'ZIP code is required'),
    country: z.string().length(2, 'Country must be 2-letter ISO code'),
  }),
});

export const listOrdersSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid('Order ID must be a valid UUID'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;