import { randomBytes } from 'node:crypto';

/**
 * Lightweight W3C Trace Context support.
 *
 * Rather than pull in the full OpenTelemetry SDK, we implement the parts the
 * platform actually relies on: generating trace/span identifiers and parsing
 * and formatting the `traceparent` header. This is the same wire format the
 * OpenTelemetry propagators use, so the services stay interoperable with any
 * collector or instrumented client while keeping the dependency surface small.
 *
 * Format (version 00):
 *   traceparent: 00-<32 hex trace-id>-<16 hex span-id>-<2 hex flags>
 *   example:     00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */

export interface TraceContext {
  /** 16-byte trace id, 32 lowercase hex chars. Stable across a request. */
  traceId: string;
  /** 8-byte span id, 16 lowercase hex chars. Unique per service hop. */
  spanId: string;
  /** Sampling decision (the low bit of the trace flags). */
  sampled: boolean;
}

const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;
const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZERO_TRACE = '0'.repeat(32);
const ALL_ZERO_SPAN = '0'.repeat(16);

/** Generate a new random trace id (32 hex chars). */
export function generateTraceId(): string {
  return randomBytes(TRACE_ID_BYTES).toString('hex');
}

/** Generate a new random span id (16 hex chars). */
export function generateSpanId(): string {
  return randomBytes(SPAN_ID_BYTES).toString('hex');
}

/**
 * Parse a `traceparent` header. Returns null if the header is missing or
 * malformed, or if it carries the invalid all-zero trace/span id — in which
 * case the caller should start a fresh trace.
 */
export function parseTraceparent(header: string | undefined): TraceContext | null {
  if (!header) return null;
  const match = TRACEPARENT_RE.exec(header.trim());
  if (!match) return null;

  const [, traceId, spanId, flags] = match;
  if (!traceId || !spanId || !flags) return null;
  if (traceId === ALL_ZERO_TRACE || spanId === ALL_ZERO_SPAN) return null;

  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 0x01) === 0x01,
  };
}

/** Format a trace context into a `traceparent` header value. */
export function formatTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Derive an inbound trace context, continuing an upstream trace when a valid
 * `traceparent` is supplied or starting a new one otherwise. Either way a
 * fresh span id is minted for this hop.
 */
export function continueTrace(header: string | undefined): TraceContext {
  const parent = parseTraceparent(header);
  if (parent) {
    return { traceId: parent.traceId, spanId: generateSpanId(), sampled: parent.sampled };
  }
  return { traceId: generateTraceId(), spanId: generateSpanId(), sampled: true };
}
