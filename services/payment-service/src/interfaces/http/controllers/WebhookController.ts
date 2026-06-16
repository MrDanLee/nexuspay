import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticationError, ValidationError } from '@nexuspay/shared';

import { ProcessWebhookHandler } from '../../../application/handlers/ProcessWebhookHandler';
import { verifySignature } from '../../../infrastructure/security/webhookSignature';

const webhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    paymentId: z.string().uuid(),
    gatewayTransactionId: z.string().optional(),
    reason: z.string().optional(),
  }),
});

/**
 * Receives gateway webhook callbacks.
 *
 * The route mounts express.raw so the exact bytes are available for HMAC
 * verification. The signature is checked first (401 on mismatch), then the
 * body is parsed and validated, then the handler applies it idempotently.
 */
export class WebhookController {
  constructor(
    private readonly processWebhookHandler: ProcessWebhookHandler,
    private readonly secret: string,
  ) {}

  handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      const signature = (req.headers['x-webhook-signature'] as string) ?? '';

      if (!verifySignature(raw, signature, this.secret)) {
        throw new AuthenticationError('Invalid webhook signature');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new ValidationError('Webhook body is not valid JSON');
      }

      const event = webhookEventSchema.safeParse(parsed);
      if (!event.success) {
        throw new ValidationError('Invalid webhook event payload');
      }

      const result = await this.processWebhookHandler.execute(event.data);
      res.status(200).json({ received: true, applied: result.applied });
    } catch (error) {
      next(error);
    }
  };
}
