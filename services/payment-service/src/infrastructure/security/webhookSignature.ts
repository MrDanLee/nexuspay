import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Compute the HMAC-SHA256 signature of a webhook payload.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a webhook signature in constant time.
 *
 * Returns false (rather than throwing) for missing or mismatched
 * signatures so the caller decides the HTTP response. timingSafeEqual
 * guards against timing attacks; the length check avoids it throwing on
 * mismatched buffer lengths.
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(payload, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
