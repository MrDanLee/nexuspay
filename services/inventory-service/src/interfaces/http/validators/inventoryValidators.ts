import { z } from 'zod';

/**
 * Request validation schemas for the inventory endpoints.
 */
export const skuParamSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(50),
});

export const checkStockSchema = z.object({
  skus: z
    .string()
    .min(1, 'skus query parameter is required')
    .transform((value) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .refine((arr) => arr.length > 0, 'At least one SKU is required')
    .refine((arr) => arr.length <= 100, 'Maximum 100 SKUs per request'),
});

export const reserveStockSchema = z.object({
  orderId: z.string().uuid('orderId must be a valid UUID'),
  items: z
    .array(
      z.object({
        sku: z.string().min(1, 'SKU is required').max(50),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
      }),
    )
    .min(1, 'At least one item is required')
    .max(50, 'Maximum 50 items per reservation'),
});

export const releaseStockSchema = z.object({
  orderId: z.string().uuid('orderId must be a valid UUID'),
  reason: z.string().max(200).optional(),
});

export type CheckStockInput = z.infer<typeof checkStockSchema>;
export type ReserveStockInput = z.infer<typeof reserveStockSchema>;
export type ReleaseStockInput = z.infer<typeof releaseStockSchema>;
