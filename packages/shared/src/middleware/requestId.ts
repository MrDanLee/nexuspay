import { randomUUID } from 'node:crypto';

import { Request, Response, NextFunction } from 'express';

import { RequestContext } from '../context/RequestContext';
import { continueTrace, formatTraceparent } from '../observability/trace';

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
 *
 * A W3C trace context is derived from the inbound `traceparent` header
 * (continuing an upstream trace when present, otherwise starting a new one),
 * stored in the context, and echoed back on the response so callers and
 * downstream hops share one trace id.
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    const correlationId = (req.headers['x-correlation-id'] as string) ?? requestId;
    const trace = continueTrace(req.headers['traceparent'] as string | undefined);

    // Set response headers for client correlation
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);
    res.setHeader('traceparent', formatTraceparent(trace));

    // Run the rest of the request within the context
    RequestContext.run(
      {
        requestId,
        correlationId,
        startTime: Date.now(),
        traceId: trace.traceId,
        spanId: trace.spanId,
      },
      () => next(),
    );
  };
}