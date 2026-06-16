import { Router } from 'express';

import { InventoryController } from '../controllers/InventoryController';

import { createInventoryRoutes } from './inventoryRoutes';

/**
 * Register all HTTP routes for the inventory service.
 */
export function registerRoutes(controller: InventoryController): Router {
  const router = Router();

  router.use('/api/v1/inventory', createInventoryRoutes(controller));

  return router;
}
