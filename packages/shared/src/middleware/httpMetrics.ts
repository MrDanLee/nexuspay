import { Request, Response, NextFunction } from 'express';

import { MetricsRegistry, defaultRegistry } from '../observability/metrics';

export interface HttpMetricsOptions {
  /** Registry to record into. Defaults to the process-wide registry. */
  registry?: MetricsRegistry;
  /** Latency histogram buckets (seconds). Defaults to the registry default. */
  buckets?: number[];
  /** Paths to skip (e.g. the scrape endpoint itself). */
  ignorePaths?: string[];
}

/**
 * Express middleware that records the RED metrics for every HTTP request:
 *
 *   - http_request_duration_seconds (histogram)  Rate + Duration
 *   - http_requests_total           (counter)    Rate + Errors (by status)
 *   - http_active_requests          (gauge)      in-flight requests
 *
 * The route label uses the matched Express route pattern (e.g.
 * `/api/v1/orders/:id`) rather than the concrete URL, so path parameters do
 * not explode metric cardinality. Unmatched requests are bucketed under
 * `unmatched` for the same reason.
 */
export function httpMetricsMiddleware(options: HttpMetricsOptions = {}) {
  const registry = options.registry ?? defaultRegistry;
  const ignore = new Set(options.ignorePaths ?? ['/metrics', '/health/live', '/health/ready']);

  const duration = registry.histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: options.buckets,
  });
  const total = registry.counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
  });
  const active = registry.gauge({
    name: 'http_active_requests',
    help: 'Number of HTTP requests currently being processed',
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (ignore.has(req.path)) {
      next();
      return;
    }

    active.inc();
    const start = process.hrtime.bigint();
    let settled = false;

    const onFinish = (): void => {
      if (settled) return;
      settled = true;
      const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = resolveRoute(req);
      const labels = { method: req.method, route, status: String(res.statusCode) };
      duration.observe(labels, elapsedSeconds);
      total.inc(labels);
      active.dec();
    };

    const onClose = (): void => {
      // Connection aborted before a response was sent: just release the gauge.
      if (settled) return;
      settled = true;
      active.dec();
    };

    res.on('finish', onFinish);
    res.on('close', onClose);

    next();
  };
}

/** Build a low-cardinality route label from the matched Express route. */
function resolveRoute(req: Request): string {
  const route = (req as Request & { route?: { path?: string } }).route;
  if (route?.path) {
    return `${req.baseUrl}${route.path}`;
  }
  return 'unmatched';
}
