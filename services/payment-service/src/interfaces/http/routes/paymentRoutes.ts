import { Router, RequestHandler } from 'express';

import { PaymentController } from '../controllers/PaymentController';

const passthrough: RequestHandler = (_req, _res, next) => next();

/**
 * Register payment routes. Prefixed with /api/v1/payments by the parent
 * router. The idempotency middleware guards the mutating routes — critical
 * for payments, where a retried request must never double-charge.
 */
export function createPaymentRoutes(
  controller: PaymentController,
  idempotency: RequestHandler = passthrough,
): Router {
  const router = Router();

  router.post('/:orderId/process', idempotency, controller.processPayment);
  router.post('/:id/refund', idempotency, controller.refund);
  router.get('/:orderId', controller.getPayment);

  return router;
}
