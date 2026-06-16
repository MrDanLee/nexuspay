import { Request, Response, NextFunction } from 'express';

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return stripHtml(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') return sanitizeObject(value as Record<string, unknown>);
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    // Drop keys that look like NoSQL/operator injection ($gt, a.b, etc.).
    if (key.startsWith('$') || key.includes('.')) continue;
    out[key] = sanitizeValue(val);
  }
  return out;
}

/**
 * Input sanitization middleware.
 *
 * Strips HTML tags from string inputs (a defence-in-depth measure against
 * stored XSS) and drops object keys beginning with `$` or containing `.`
 * to neutralise NoSQL operator-injection payloads. Applied to the request
 * body and query string; the raw bytes of webhook routes are untouched
 * because this runs after, and only when, a JSON body has been parsed.
 */
export function sanitizeMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body as Record<string, unknown>);
    }

    if (req.query && typeof req.query === 'object') {
      const query = req.query as Record<string, unknown>;
      for (const key of Object.keys(query)) {
        if (key.startsWith('$') || key.includes('.')) {
          delete query[key];
          continue;
        }
        query[key] = sanitizeValue(query[key]);
      }
    }

    next();
  };
}
