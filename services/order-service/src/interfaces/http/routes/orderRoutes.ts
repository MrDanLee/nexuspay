import { Router } from 'express';

import { OrderController } from '../controllers/OrderController';

/**
 * Register order routes.
 *
 * All routes are prefixed with /api/v1/orders by the parent router.
 */
export function createOrderRoutes(controller: OrderController): Router {
  const router = Router();

  router.post('/', controller.createOrder);
  router.get('/', controller.listOrders);
  router.get('/:id', controller.getOrder);
  router.post('/:id/cancel', controller.cancelOrder);

  return router;
}