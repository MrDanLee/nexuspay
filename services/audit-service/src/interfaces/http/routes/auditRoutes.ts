import { Router } from 'express';

import { AuditController } from '../controllers/AuditController';

/**
 * Audit query routes.
 *
 * /search is declared before /orders/:id so the literal path is not captured
 * by the parameterized one.
 */
export function createAuditRoutes(controller: AuditController): Router {
  const router = Router();

  router.get('/search', controller.search);
  router.get('/orders/:id', controller.byAggregate);

  return router;
}
