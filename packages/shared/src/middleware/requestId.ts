import { randomUUID } from 'node:crypto';

import { Request, Response, NextFunction } from 'express';

import { RequestContext } from '../context/RequestContext';

/**
 * Middleware that ensures every request has a unique ID.
 *
 * If the client sends an X-Request-ID header, it's used as-is.
 * Otherwise, a new UUID is generated. The ID is:
 * 1. Stored in RequestContext (accessible anywhere via AsyncLocalStorage)
 * 2. Set as a response header (for client correlation)
 *
 * A correlationId is also generated or extracted. Unlike requestId
 * (unique per request), correlationId can be shared across multiple
 * requests that are part of the same business operation.
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    const correlationId = (req.headers['x-correlation-id'] as string) ?? requestId;

    // Set response headers for client correlation
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);

    // Run the rest of the request within the context
    RequestContext.run(
      {
        requestId,
        correlationId,
        startTime: Date.now(),
      },
      () => next(),
    );
  };
}