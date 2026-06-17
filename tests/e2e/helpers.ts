import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

/** Whether the e2e suite should run (full stack must be up). */
export const SHOULD_RUN = process.env.RUN_E2E === '1';

export const ORDER_URL = process.env.ORDER_URL ?? 'http://localhost:3001';
export const INVENTORY_URL = process.env.INVENTORY_URL ?? 'http://localhost:3003';

const JWT_SECRET =
  process.env.JWT_SECRET ?? 'nexuspay-dev-secret-change-in-production-min-32-chars';

/** Mint a customer JWT accepted by the order service. */
export function mintToken(userId = 'e2e-customer'): string {
  return jwt.sign({ sub: userId, roles: ['customer'] }, JWT_SECRET, { expiresIn: '1h' });
}

export interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

export async function http<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<HttpResult<T>> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    /* leave as text */
  }
  return { status: res.status, body: body as T };
}

export function authHeaders(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

export interface CreateOrderOptions {
  sku: string;
  quantity?: number;
  unitPrice?: number;
}

export function orderPayload(opts: CreateOrderOptions): Record<string, unknown> {
  return {
    currency: 'USD',
    items: [
      {
        productId: randomUUID(),
        sku: opts.sku,
        quantity: opts.quantity ?? 1,
        unitPrice: opts.unitPrice ?? 100,
      },
    ],
    shippingAddress: {
      line1: '1 Test Street',
      city: 'Testville',
      zip: '12345',
      country: 'US',
    },
  };
}

const TERMINAL = new Set([
  'CONFIRMED',
  'CANCELLED',
  'PAYMENT_FAILED',
  'INVENTORY_FAILED',
]);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll an order's timeline until it reaches a terminal status (or times out). */
export async function waitForOrderStatus(
  orderId: string,
  token: string,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = 'UNKNOWN';
  while (Date.now() < deadline) {
    const { status, body } = await http<{ status: string }>(
      `${ORDER_URL}/api/v1/orders/${orderId}/timeline`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (status === 200 && body?.status) {
      last = body.status;
      if (TERMINAL.has(last)) return last;
    }
    await sleep(1000);
  }
  return last;
}
