import express, { Router } from 'express';

import { WebhookController } from '../controllers/WebhookController';

/**
 * Register webhook routes.
 *
 * express.raw captures the exact request bytes so the HMAC signature can
 * be verified before the body is parsed. This route must be mounted before
 * any global JSON body parser.
 */
export function createWebhookRoutes(controller: WebhookController): Router {
  const router = Router();

  router.post('/payment', express.raw({ type: '*/*' }), controller.handle);

  return router;
}
