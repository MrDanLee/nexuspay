import { Request, Response, NextFunction } from 'express';
import { ValidationError, RequestContext } from '@nexuspay/shared';

import { CreateOrderHandler } from '../../../application/handlers/CreateOrderHandler';
import { CancelOrderHandler } from '../../../application/handlers/CancelOrderHandler';
import { GetOrderHandler } from '../../../application/queries/GetOrderQuery';
import { ListOrdersHandler } from '../../../application/queries/ListOrdersQuery';
import {
  createOrderSchema,
  listOrdersSchema,
  orderIdParamSchema,
} from '../validators/orderValidators';

/**
 * HTTP controller for order endpoints.
 *
 * Responsibilities:
 * - Parse and validate HTTP requests
 * - Extract user context from auth
 * - Delegate to application handlers
 * - Format HTTP responses
 *
 * Contains NO business logic — that lives in handlers and domain entities.
 */
export class OrderController {
  constructor(
    private readonly createOrderHandler: CreateOrderHandler,
    private readonly cancelOrderHandler: CancelOrderHandler,
    private readonly getOrderHandler: GetOrderHandler,
    private readonly listOrdersHandler: ListOrdersHandler,
  ) { }

  /**
   * POST /api/v1/orders
   */
  createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate input
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        parsed.error.issues.forEach((issue) => {
          fields[issue.path.join('.')] = issue.message;
        });
        throw new ValidationError('Invalid order data', { fields });
      }

      // Extract idempotency key from header
      const idempotencyKey = req.headers['idempotency-key'] as string;
      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required');
      }

      // TODO: Extract from JWT auth middleware
      const customerId = (req as Request & { userId?: string }).userId ?? 'anonymous';

      const result = await this.createOrderHandler.execute({
        customerId,
        idempotencyKey,
        currency: parsed.data.currency,
        items: parsed.data.items,
        shippingAddress: parsed.data.shippingAddress,
      });

      const statusCode = result.isExisting ? 200 : 201;
      res.status(statusCode).json(this.formatOrderResponse(result.order));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/orders/:id
   */
  getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = orderIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError('Invalid order ID');
      }

      const customerId = (req as Request & { userId?: string }).userId ?? 'anonymous';
      const order = await this.getOrderHandler.execute(params.data.id, customerId);

      res.json(this.formatOrderResponse(order));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/orders
   */
  listOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listOrdersSchema.safeParse(req.query);
      if (!query.success) {
        throw new ValidationError('Invalid query parameters');
      }

      const customerId = (req as Request & { userId?: string }).userId ?? 'anonymous';
      const result = await this.listOrdersHandler.execute({
        customerId,
        ...query.data,
      });

      res.json({
        data: result.data.map((order) => this.formatOrderResponse(order)),
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/orders/:id/cancel
   */
  cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = orderIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError('Invalid order ID');
      }

      const customerId = (req as Request & { userId?: string }).userId ?? 'anonymous';
      const order = await this.cancelOrderHandler.execute({
        orderId: params.data.id,
        customerId,
        reason: req.body?.reason,
      });

      res.json(this.formatOrderResponse(order));
    } catch (error) {
      next(error);
    }
  };

  /**
   * Format order for HTTP response.
   */
  private formatOrderResponse(order: import('../../../domain/entities/Order').Order) {
    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      items: order.items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
        totalPrice: item.totalPrice.toNumber(),
      })),
      totalAmount: order.totalAmount.toNumber(),
      currency: order.currency,
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      links: {
        self: `/api/v1/orders/${order.id}`,
        cancel: `/api/v1/orders/${order.id}/cancel`,
      },
    };
  }
}