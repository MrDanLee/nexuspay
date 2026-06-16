import { Router, RequestHandler } from 'express';

import { OrderController } from '../controllers/OrderController';

const passthrough: RequestHandler = (_req, _res, next) => next();

/**
 * Register order routes.
 *
 * All routes are prefixed with /api/v1/orders by the parent router.
 * The idempotency middleware (when provided) guards the mutating routes so
 * retried create/cancel requests return the cached response.
 */
export function createOrderRoutes(
  controller: OrderController,
  idempotency: RequestHandler = passthrough,
): Router {
  const router = Router();

  router.post('/', idempotency, controller.createOrder);
  router.get('/', controller.listOrders);
  router.get('/:id/timeline', controller.getTimeline);
  router.get('/:id', controller.getOrder);
  router.post('/:id/cancel', idempotency, controller.cancelOrder);

  return router;
}