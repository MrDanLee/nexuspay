import { z } from 'zod';

/** Pagination shared by both query endpoints. */
const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export const aggregateParamSchema = z.object({
  id: z.string().min(1),
});

export const searchQuerySchema = paginationSchema.extend({
  type: z.string().min(1).optional(),
  aggregateId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const aggregateQuerySchema = paginationSchema;

export type SearchQuery = z.infer<typeof searchQuerySchema>;
