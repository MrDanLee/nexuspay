import {
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
  continueTrace,
} from '../../../src/observability/trace';

describe('trace id generation', () => {
  it('generates 32 hex char trace ids', () => {
    expect(generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates 16 hex char span ids', () => {
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generates distinct ids', () => {
    expect(generateTraceId()).not.toBe(generateTraceId());
  });
});

describe('parseTraceparent', () => {
  it('parses a valid sampled header', () => {
    const ctx = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(ctx).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
  });

  it('parses an unsampled header', () => {
    const ctx = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00');
    expect(ctx?.sampled).toBe(false);
  });

  it('returns null for undefined, malformed, or wrong-length input', () => {
    expect(parseTraceparent(undefined)).toBeNull();
    expect(parseTraceparent('garbage')).toBeNull();
    expect(parseTraceparent('00-tooshort-00f067aa0ba902b7-01')).toBeNull();
    expect(parseTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBeNull();
  });

  it('rejects the all-zero trace and span ids', () => {
    expect(
      parseTraceparent(`00-${'0'.repeat(32)}-00f067aa0ba902b7-01`),
    ).toBeNull();
    expect(
      parseTraceparent(`00-4bf92f3577b34da6a3ce929d0e0e4736-${'0'.repeat(16)}-01`),
    ).toBeNull();
  });
});

describe('formatTraceparent', () => {
  it('round-trips with parseTraceparent', () => {
    const header = formatTraceparent({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
    expect(header).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(parseTraceparent(header)).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true,
    });
  });
});

describe('continueTrace', () => {
  it('continues an upstream trace but mints a fresh span', () => {
    const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const ctx = continueTrace(header);
    expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(ctx.spanId).not.toBe('00f067aa0ba902b7');
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('starts a new sampled trace when no valid header is present', () => {
    const ctx = continueTrace(undefined);
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(ctx.sampled).toBe(true);
  });
});
