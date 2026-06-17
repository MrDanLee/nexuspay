import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@nexuspay/shared';

import { AuditQueryHandler } from '../../../application/queries/AuditQueryHandler';
import {
  aggregateParamSchema,
  aggregateQuerySchema,
  searchQuerySchema,
} from '../validators/auditValidators';

function toFieldErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  issues.forEach((issue) => {
    const key = issue.path.map(String).join('.') || 'query';
    fields[key] = issue.message;
  });
  return fields;
}

/**
 * HTTP controller for the audit query API. Parses and validates requests and
 * delegates to the read-side handler; contains no business logic.
 */
export class AuditController {
  constructor(private readonly queries: AuditQueryHandler) {}

  /** GET /audit/orders/:id — full event history for an aggregate (order). */
  byAggregate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = aggregateParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError('Invalid aggregate id');
      }
      const query = aggregateQuerySchema.safeParse(req.query);
      if (!query.success) {
        throw new ValidationError('Invalid pagination', { fields: toFieldErrors(query.error.issues) });
      }

      const result = await this.queries.byAggregate(params.data.id, query.data);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /** GET /audit/search?type=&aggregateId=&from=&to=&limit=&offset= */
  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = searchQuerySchema.safeParse(req.query);
      if (!query.success) {
        throw new ValidationError('Invalid search query', {
          fields: toFieldErrors(query.error.issues),
        });
      }

      const { type, aggregateId, from, to, limit, offset } = query.data;
      const result = await this.queries.search(
        { eventType: type, aggregateId, from, to },
        { limit, offset },
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
