import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@nexuspay/shared';

import { Payment } from '../../../domain/entities/Payment';
import { ProcessPaymentHandler } from '../../../application/handlers/ProcessPaymentHandler';
import { RefundHandler } from '../../../application/handlers/RefundHandler';
import { GetPaymentHandler } from '../../../application/queries/GetPaymentQuery';
import {
  orderIdParamSchema,
  paymentIdParamSchema,
  processPaymentSchema,
  refundSchema,
} from '../validators/paymentValidators';

/**
 * HTTP controller for payment endpoints.
 *
 * Parses/validates requests, requires an Idempotency-Key on the mutating
 * routes, delegates to the application handlers, and formats responses.
 */
export class PaymentController {
  constructor(
    private readonly processPaymentHandler: ProcessPaymentHandler,
    private readonly refundHandler: RefundHandler,
    private readonly getPaymentHandler: GetPaymentHandler,
  ) {}

  /**
   * POST /api/v1/payments/:orderId/process
   */
  processPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = orderIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError('Invalid order id');
      }

      const body = processPaymentSchema.safeParse(req.body);
      if (!body.success) {
        const fields: Record<string, string> = {};
        body.error.issues.forEach((issue) => {
          fields[issue.path.join('.')] = issue.message;
        });
        throw new ValidationError('Invalid payment request', { fields });
      }

      const idempotencyKey = req.headers['idempotency-key'] as string;
      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required');
      }

      const result = await this.processPaymentHandler.execute({
        orderId: params.data.orderId,
        customerId: body.data.customerId,
        amount: body.data.amount,
        currency: body.data.currency,
        idempotencyKey,
      });

      res.status(201).json(this.formatPayment(result.payment));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/payments/:id/refund
   */
  refund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = paymentIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError('Invalid payment id');
      }

      const body = refundSchema.safeParse(req.body ?? {});
      if (!body.success) {
        throw new ValidationError('Invalid refund request');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string;
      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required');
      }

      const result = await this.refundHandler.execute({
        paymentId: params.data.id,
        idempotencyKey,
        reason: body.data.reason,
      });

      res.json({ ...this.formatPayment(result.payment), refund: result.refund });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/payments/:orderId
   */
  getPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = orderIdParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new ValidationError('Invalid order id');
      }

      const payment = await this.getPaymentHandler.execute(params.data.orderId);
      res.json(this.formatPayment(payment));
    } catch (error) {
      next(error);
    }
  };

  private formatPayment(payment: Payment) {
    return {
      id: payment.id,
      orderId: payment.orderId,
      customerId: payment.customerId,
      status: payment.status,
      amount: payment.amount.toNumber(),
      currency: payment.amount.currency,
      gatewayTransactionId: payment.gatewayTransactionId,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      links: {
        self: `/api/v1/payments/${payment.orderId}`,
        refund: `/api/v1/payments/${payment.id}/refund`,
      },
    };
  }
}
