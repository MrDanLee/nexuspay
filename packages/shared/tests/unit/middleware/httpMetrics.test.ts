import express, { Request, Response } from 'express';
import supertest from 'supertest';

import { httpMetricsMiddleware } from '../../../src/middleware/httpMetrics';
import { MetricsRegistry } from '../../../src/observability/metrics';

function createApp(registry: MetricsRegistry) {
  const app = express();
  app.use(httpMetricsMiddleware({ registry }));
  app.get('/api/v1/orders/:id', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  app.get('/boom', (_req: Request, res: Response) => {
    res.status(500).json({ error: true });
  });
  return app;
}

describe('httpMetricsMiddleware', () => {
  it('counts requests labelled by method, matched route and status', async () => {
    const registry = new MetricsRegistry();
    const app = createApp(registry);

    await supertest(app).get('/api/v1/orders/123').expect(200);
    await supertest(app).get('/api/v1/orders/456').expect(200);

    const out = registry.render();
    expect(out).toContain('http_requests_total{method="GET",route="/api/v1/orders/:id",status="200"} 2');
  });

  it('records latency in the duration histogram', async () => {
    const registry = new MetricsRegistry();
    const app = createApp(registry);

    await supertest(app).get('/api/v1/orders/123').expect(200);

    const out = registry.render();
    expect(out).toContain('http_request_duration_seconds_count');
    expect(out).toMatch(/http_request_duration_seconds_count\{[^}]*\} 1/);
  });

  it('labels server errors with their status code', async () => {
    const registry = new MetricsRegistry();
    const app = createApp(registry);

    await supertest(app).get('/boom').expect(500);

    expect(registry.render()).toContain('status="500"');
  });

  it('buckets unmatched routes under "unmatched"', async () => {
    const registry = new MetricsRegistry();
    const app = createApp(registry);

    await supertest(app).get('/does-not-exist').expect(404);

    expect(registry.render()).toContain('route="unmatched"');
  });

  it('releases the in-flight gauge after the response finishes', async () => {
    const registry = new MetricsRegistry();
    const app = createApp(registry);

    await supertest(app).get('/api/v1/orders/123').expect(200);

    expect(registry.render()).toContain('http_active_requests 0');
  });

  it('skips ignored paths', async () => {
    const registry = new MetricsRegistry();
    const app = express();
    app.use(httpMetricsMiddleware({ registry, ignorePaths: ['/metrics'] }));
    app.get('/metrics', (_req: Request, res: Response) => res.send('ok'));

    await supertest(app).get('/metrics').expect(200);

    expect(registry.render()).not.toContain('route="/metrics"');
  });
});
