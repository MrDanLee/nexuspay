import { Counter, Gauge, Histogram, MetricsRegistry } from '../../../src/observability/metrics';

describe('Counter', () => {
  it('increments by 1 by default and accumulates', () => {
    const c = new Counter({ name: 'jobs_total', help: 'jobs' });
    c.inc();
    c.inc();
    c.inc({}, 3);
    expect(c.get()).toBe(5);
  });

  it('tracks independent series per label set', () => {
    const c = new Counter({ name: 'http_total', help: 'reqs', labelNames: ['status'] });
    c.inc({ status: '200' });
    c.inc({ status: '200' });
    c.inc({ status: '500' });
    expect(c.get({ status: '200' })).toBe(2);
    expect(c.get({ status: '500' })).toBe(1);
    expect(c.get({ status: '404' })).toBe(0);
  });

  it('rejects negative increments', () => {
    const c = new Counter({ name: 'c', help: 'c' });
    expect(() => c.inc({}, -1)).toThrow();
  });

  it('renders a zero line when no observations exist', () => {
    const c = new Counter({ name: 'empty_total', help: 'empty' });
    expect(c.render()).toContain('empty_total 0');
  });

  it('renders labelled series in exposition format', () => {
    const c = new Counter({ name: 'http_total', help: 'reqs', labelNames: ['method'] });
    c.inc({ method: 'GET' });
    const out = c.render();
    expect(out).toContain('# TYPE http_total counter');
    expect(out).toContain('http_total{method="GET"} 1');
  });
});

describe('Gauge', () => {
  it('supports set, inc and dec', () => {
    const g = new Gauge({ name: 'in_flight', help: 'in flight' });
    g.set({}, 10);
    g.inc();
    g.dec({}, 4);
    expect(g.get()).toBe(7);
  });

  it('renders the current value', () => {
    const g = new Gauge({ name: 'queue_depth', help: 'depth', labelNames: ['queue'] });
    g.set({ queue: 'orders' }, 42);
    expect(g.render()).toContain('queue_depth{queue="orders"} 42');
  });
});

describe('Histogram', () => {
  it('accumulates count and sum', () => {
    const h = new Histogram({ name: 'lat', help: 'latency', buckets: [0.1, 0.5, 1] });
    h.observe({}, 0.05);
    h.observe({}, 0.2);
    h.observe({}, 2);
    const out = h.render();
    expect(out).toContain('lat_count 3');
    expect(out).toContain('lat_sum 2.25');
  });

  it('places observations into cumulative buckets', () => {
    const h = new Histogram({ name: 'lat', help: 'latency', buckets: [0.1, 0.5, 1] });
    h.observe({}, 0.05); // <= 0.1, 0.5, 1
    h.observe({}, 0.3); // <= 0.5, 1
    const out = h.render();
    expect(out).toContain('lat_bucket{le="0.1"} 1');
    expect(out).toContain('lat_bucket{le="0.5"} 2');
    expect(out).toContain('lat_bucket{le="1"} 2');
    expect(out).toContain('lat_bucket{le="+Inf"} 2');
  });
});

describe('MetricsRegistry', () => {
  it('returns the same instance for repeated factory calls', () => {
    const r = new MetricsRegistry();
    const a = r.counter({ name: 'reuse_total', help: 'h' });
    const b = r.counter({ name: 'reuse_total', help: 'h' });
    expect(a).toBe(b);
  });

  it('throws when the same name is registered with a different type', () => {
    const r = new MetricsRegistry();
    r.counter({ name: 'x', help: 'h' });
    expect(() => r.gauge({ name: 'x', help: 'h' })).toThrow();
  });

  it('renders all registered metrics together', () => {
    const r = new MetricsRegistry();
    r.counter({ name: 'a_total', help: 'a' }).inc();
    r.gauge({ name: 'b', help: 'b' }).set({}, 3);
    const out = r.render();
    expect(out).toContain('a_total 1');
    expect(out).toContain('b 3');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('clear removes all metrics', () => {
    const r = new MetricsRegistry();
    r.counter({ name: 'a_total', help: 'a' }).inc();
    r.clear();
    expect(r.render().trim()).toBe('');
  });
});
