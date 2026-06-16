import { Router } from 'express';

import { InventoryController } from '../controllers/InventoryController';

/**
 * Register inventory routes.
 *
 * Routes are prefixed with /api/v1/inventory by the parent router.
 * The static '/check' path is declared before '/:sku' so it is not
 * captured by the dynamic SKU parameter.
 */
export function createInventoryRoutes(controller: InventoryController): Router {
  const router = Router();

  router.get('/check', controller.checkStock);
  router.get('/:sku', controller.getStock);
  router.post('/reserve', controller.reserveStock);
  router.post('/release', controller.releaseStock);

  return router;
}
