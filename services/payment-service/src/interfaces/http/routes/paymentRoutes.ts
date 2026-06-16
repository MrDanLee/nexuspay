import { Router } from 'express';

import { PaymentController } from '../controllers/PaymentController';

/**
 * Register payment routes. Prefixed with /api/v1/payments by the parent
 * router.
 */
export function createPaymentRoutes(controller: PaymentController): Router {
  const router = Router();

  router.post('/:orderId/process', controller.processPayment);
  router.post('/:id/refund', controller.refund);
  router.get('/:orderId', controller.getPayment);

  return router;
}
