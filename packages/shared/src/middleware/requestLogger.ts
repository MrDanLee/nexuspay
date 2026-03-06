import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';

import { RequestContext } from '../context/RequestContext';

/**
 * Middleware that logs every incoming request and its response.
 *
 * Logs:
 * - On request: method, path, user agent
 * - On response: status code, duration in ms
 *
 * Sensitive headers (Authorization, Cookie) are never logged.
 */
export function requestLoggerMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = RequestContext.get();
    const reqLogger = logger.child({
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });

    reqLogger.info(
      {
        method: req.method,
        path: req.originalUrl,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
      'Incoming request',
    );

    // Capture response timing
    const startTime = Date.now();

    // Hook into response finish event
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logData = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        duration_ms: duration,
      };

      if (res.statusCode >= 500) {
        reqLogger.error(logData, 'Request completed with server error');
      } else if (res.statusCode >= 400) {
        reqLogger.warn(logData, 'Request completed with client error');
      } else {
        reqLogger.info(logData, 'Request completed');
      }
    });

    next();
  };
}