import { randomUUID } from 'node:crypto';

import {
  SHOULD_RUN,
  ORDER_URL,
  http,
  mintToken,
  authHeaders,
  orderPayload,
  waitForOrderStatus,
} from './helpers';

/**
 * End-to-end happy path against the running full stack:
 *
 *   docker compose up -d --build
 *   RUN_E2E=1 npm run test:e2e
 *
 * Skipped by default so `npm test` stays green without infrastructure.
 */
const describeE2E = SHOULD_RUN ? describe : describe.skip;

describeE2E('order flow (e2e)', () => {
  const token = mintToken();

  it('creates an order and the saga drives it to CONFIRMED', async () => {
    const create = await http<{ id: string; status: string }>(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: authHeaders(token, randomUUID()),
      body: JSON.stringify(orderPayload({ sku: 'LAPTOP-PRO-15', quantity: 1 })),
    });

    expect(create.status).toBe(201);
    expect(create.body.id).toBeDefined();

    const finalStatus = await waitForOrderStatus(create.body.id, token);
    expect(finalStatus).toBe('CONFIRMED');
  });

  it('returns the same order for a repeated idempotency key', async () => {
    const key = randomUUID();
    const payload = JSON.stringify(orderPayload({ sku: 'PHONE-X-256', quantity: 1 }));

    const first = await http<{ id: string }>(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: authHeaders(token, key),
      body: payload,
    });
    const second = await http<{ id: string }>(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: authHeaders(token, key),
      body: payload,
    });

    expect(first.body.id).toBeDefined();
    expect(second.body.id).toBe(first.body.id);
  });
});
