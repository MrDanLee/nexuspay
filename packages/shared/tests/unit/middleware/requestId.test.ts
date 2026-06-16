import express, { Request, Response } from 'express';
import supertest from 'supertest';

import { requestIdMiddleware } from '../../../src/middleware/requestId';
import { RequestContext } from '../../../src/context/RequestContext';
import { parseTraceparent } from '../../../src/observability/trace';

function createApp() {
  const app = express();
  app.use(requestIdMiddleware());
  app.get('/', (_req: Request, res: Response) => {
    const ctx = RequestContext.get();
    res.json({ traceId: ctx?.traceId, spanId: ctx?.spanId, requestId: ctx?.requestId });
  });
  return app;
}

describe('requestIdMiddleware trace context', () => {
  it('starts a new trace and echoes traceparent on the response', async () => {
    const res = await supertest(createApp()).get('/').expect(200);

    const header = res.headers['traceparent'];
    const parsed = parseTraceparent(header);
    expect(parsed).not.toBeNull();
    expect(res.body.traceId).toBe(parsed?.traceId);
    expect(res.body.spanId).toBe(parsed?.spanId);
  });

  it('continues an upstream trace but mints a fresh span', async () => {
    const upstream = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const res = await supertest(createApp()).get('/').set('traceparent', upstream).expect(200);

    expect(res.body.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(res.body.spanId).not.toBe('00f067aa0ba902b7');
    expect(parseTraceparent(res.headers['traceparent'])?.traceId).toBe(
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
  });
});
