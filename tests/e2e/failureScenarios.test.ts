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
 * End-to-end failure scenarios. Gated behind RUN_E2E=1.
 */
const describeE2E = SHOULD_RUN ? describe : describe.skip;

describeE2E('order failure scenarios (e2e)', () => {
  const token = mintToken();

  it('cancels the order when inventory cannot be reserved', async () => {
    // A SKU that does not exist (or has no stock) cannot be reserved, so the
    // saga emits inventory.failed and the order is cancelled.
    const create = await http<{ id: string }>(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: authHeaders(token, randomUUID()),
      body: JSON.stringify(orderPayload({ sku: 'DOES-NOT-EXIST-SKU', quantity: 1 })),
    });

    expect(create.status).toBe(201);

    const finalStatus = await waitForOrderStatus(create.body.id, token);
    expect(['CANCELLED', 'INVENTORY_FAILED']).toContain(finalStatus);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await http(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify(orderPayload({ sku: 'LAPTOP-PRO-15' })),
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid input with 400', async () => {
    const res = await http(`${ORDER_URL}/api/v1/orders`, {
      method: 'POST',
      headers: authHeaders(mintToken(), randomUUID()),
      body: JSON.stringify({ currency: 'USD', items: [] }),
    });
    expect(res.status).toBe(400);
  });
});
