import cors from 'cors';
import { RequestHandler } from 'express';
import helmet from 'helmet';

export interface SecurityOptions {
  /** CORS origin(s). Default true (reflect request origin). */
  corsOrigin?: string | string[] | boolean;
}

/**
 * Standard security headers and CORS, applied globally by every service.
 *
 * Bundles Helmet (sensible secure-header defaults: HSTS, no-sniff, frame
 * deny, etc.) with a configurable CORS policy so the configuration lives
 * in one place instead of being copy-pasted per service.
 */
export function securityHeaders(options: SecurityOptions = {}): RequestHandler[] {
  return [
    helmet(),
    cors({
      origin: options.corsOrigin ?? true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-ID'],
      credentials: true,
    }),
  ];
}
