import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';

import { RequestContext } from '../context/RequestContext';
import { AppError, InternalError } from '../errors/AppError';

/**
 * Global error handling middleware.
 *
 * Catches all errors thrown in route handlers and middleware,
 * serializes them to RFC 7807 format, and sends the appropriate
 * HTTP response. Unknown errors are wrapped in InternalError
 * to prevent leaking implementation details to clients.
 *
 * MUST be registered last in the middleware chain (after all routes).
 */
export function errorHandlerMiddleware(logger: Logger) {
  // Express error handlers MUST have 4 parameters
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const ctx = RequestContext.get();

    // Determine if this is an operational error or an unexpected bug
    const appError: AppError =
      err instanceof AppError ? err : new InternalError('An unexpected error occurred', { cause: err });

    // Build log context
    const logContext = {
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      method: req.method,
      path: req.originalUrl,
      statusCode: appError.statusCode,
      errorType: appError.constructor.name,
    };

    // Log based on error severity
    if (appError.isOperational) {
      logger.warn({ ...logContext, detail: appError.detail }, 'Operational error');
    } else {
      // Non-operational errors are bugs — log with full stack
      logger.error(
        { ...logContext, err: err, detail: appError.detail },
        'Unexpected error — this is a bug',
      );
    }

    // Build RFC 7807 response
    const body = {
      ...appError.toJSON(),
      ...(ctx?.requestId && { traceId: ctx.requestId }),
    };

    res.status(appError.statusCode).json(body);
  };
}