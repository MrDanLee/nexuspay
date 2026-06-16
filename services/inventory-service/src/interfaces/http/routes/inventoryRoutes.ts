import { Router } from 'express';

import { InventoryController } from '../controllers/InventoryController';

/**
 * Register inventory routes.
 *
 * Routes are prefixed with /api/v1/inventory by the parent router.
 * The static '/check' path is declared before '/:sku' so it is not
 * captured by the dynamic SKU parameter.
 *
 * OpenAPI annotations below document the contract for swagger-jsdoc /
 * Redoc generation (see docs/api/openapi.yaml for the assembled spec).
 */
export function createInventoryRoutes(controller: InventoryController): Router {
  const router = Router();

  /**
   * @openapi
   * /api/v1/inventory/check:
   *   get:
   *     summary: Bulk stock availability check
   *     tags: [Inventory]
   *     parameters:
   *       - in: query
   *         name: skus
   *         required: true
   *         schema: { type: string }
   *         description: Comma-separated list of SKUs (max 100)
   *     responses:
   *       200:
   *         description: Availability for each requested SKU, in order
   *       400:
   *         description: Missing or invalid skus parameter
   */
  router.get('/check', controller.checkStock);

  /**
   * @openapi
   * /api/v1/inventory/{sku}:
   *   get:
   *     summary: Get the stock level for a single SKU
   *     tags: [Inventory]
   *     parameters:
   *       - in: path
   *         name: sku
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Stock level (available/reserved quantities)
   *       404:
   *         description: SKU not found
   */
  router.get('/:sku', controller.getStock);

  /**
   * @openapi
   * /api/v1/inventory/reserve:
   *   post:
   *     summary: Reserve stock for an order (service-to-service)
   *     tags: [Inventory]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [orderId, items]
   *             properties:
   *               orderId: { type: string, format: uuid }
   *               items:
   *                 type: array
   *                 items:
   *                   type: object
   *                   required: [sku, quantity]
   *                   properties:
   *                     sku: { type: string }
   *                     quantity: { type: integer, minimum: 1 }
   *     responses:
   *       201:
   *         description: Reservation created; returns reservation IDs
   *       404:
   *         description: One or more SKUs are unknown
   *       409:
   *         description: Insufficient stock; nothing was reserved
   */
  router.post('/reserve', controller.reserveStock);

  /**
   * @openapi
   * /api/v1/inventory/release:
   *   post:
   *     summary: Release an order's reservations (service-to-service)
   *     tags: [Inventory]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [orderId]
   *             properties:
   *               orderId: { type: string, format: uuid }
   *               reason: { type: string }
   *     responses:
   *       200:
   *         description: Returns the number of reservations released (idempotent)
   */
  router.post('/release', controller.releaseStock);

  return router;
}
