import { Router, RequestHandler } from 'express';

import { OrderController } from '../controllers/OrderController';

import { createOrderRoutes } from './orderRoutes';

/**
 * Register all HTTP routes for the order service.
 *
 * As the service grows, new route modules are mounted here. Keeping this
 * separate from app.ts lets app.ts stay focused on middleware ordering.
 */
export function registerRoutes(controller: OrderController, idempotency?: RequestHandler): Router {
  const router = Router();

  router.use('/api/v1/orders', createOrderRoutes(controller, idempotency));

  // Future: router.use('/api/v1/saga', createSagaRoutes(...));

  return router;
}
