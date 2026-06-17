import { ValidationError, NotFoundError } from '@nexuspay/shared';
import { Request, Response, NextFunction } from 'express';

import { ReleaseStockHandler } from '../../../application/handlers/ReleaseStockHandler';
import { ReserveStockHandler } from '../../../application/handlers/ReserveStockHandler';
import { CheckStockHandler } from '../../../application/queries/CheckStockQuery';
import {
  skuParamSchema,
  checkStockSchema,
  reserveStockSchema,
  releaseStockSchema,
} from '../validators/inventoryValidators';

/**
 * HTTP controller for the inventory endpoints.
 *
 * Parses and validates requests, delegates to application handlers, and
 * formats responses. Contains no business logic. The reserve/release
 * endpoints are service-to-service (driven by the saga), while the stock
 * lookups are read-only and safe to expose more broadly.
 */
export class InventoryController {
  constructor(
    private readonly reserveStockHandler: ReserveStockHandler,
    private readonly releaseStockHandler: ReleaseStockHandler,
    private readonly checkStockHandler: CheckStockHandler,
  ) {}

  /**
   * GET /inventory/:sku
   */
  getStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = skuParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError('Invalid SKU');
      }

      const [level] = await this.checkStockHandler.execute([params.data.sku]);
      if (!level || !level.found) {
        throw new NotFoundError(`SKU ${params.data.sku} not found`, {
          instance: `/api/v1/inventory/${params.data.sku}`,
        });
      }

      res.json(level);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /inventory/check?skus=SKU-1,SKU-2
   */
  checkStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = checkStockSchema.safeParse(req.query);
      if (!query.success) {
        const fields: Record<string, string> = {};
        query.error.issues.forEach((issue) => {
          fields[issue.path.join('.') || 'skus'] = issue.message;
        });
        throw new ValidationError('Invalid stock check request', { fields });
      }

      const levels = await this.checkStockHandler.execute(query.data.skus);
      res.json({ data: levels });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /inventory/reserve  (internal, service-to-service)
   */
  reserveStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = reserveStockSchema.safeParse(req.body);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        parsed.error.issues.forEach((issue) => {
          fields[issue.path.join('.')] = issue.message;
        });
        throw new ValidationError('Invalid reservation request', { fields });
      }

      const result = await this.reserveStockHandler.execute(parsed.data);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /inventory/release  (internal, service-to-service)
   */
  releaseStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = releaseStockSchema.safeParse(req.body);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        parsed.error.issues.forEach((issue) => {
          fields[issue.path.join('.')] = issue.message;
        });
        throw new ValidationError('Invalid release request', { fields });
      }

      const result = await this.releaseStockHandler.execute(parsed.data);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
