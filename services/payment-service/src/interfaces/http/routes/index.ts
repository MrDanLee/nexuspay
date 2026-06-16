import { Router, RequestHandler } from 'express';

import { PaymentController } from '../controllers/PaymentController';

import { createPaymentRoutes } from './paymentRoutes';

/**
 * Register the payment API routes.
 *
 * Webhook routes are mounted separately in app.ts (before the JSON body
 * parser) because they require the raw request body for HMAC verification.
 */
export function registerRoutes(
  controller: PaymentController,
  idempotency?: RequestHandler,
): Router {
  const router = Router();

  router.use('/api/v1/payments', createPaymentRoutes(controller, idempotency));

  return router;
}
