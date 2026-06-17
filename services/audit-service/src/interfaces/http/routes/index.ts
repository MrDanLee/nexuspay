import { Router } from 'express';

import { AuditController } from '../controllers/AuditController';

import { createAuditRoutes } from './auditRoutes';

/** Register all HTTP routes for the audit service. */
export function registerRoutes(controller: AuditController): Router {
  const router = Router();

  router.use('/api/v1/audit', createAuditRoutes(controller));

  return router;
}
