/**
 * Minimal, dependency-free Prometheus metrics registry.
 *
 * We deliberately avoid pulling in `prom-client` here: the exposition format
 * is small and stable, and a hand-rolled registry keeps the build hermetic
 * (no transitive type clashes) while remaining fully unit-testable without a
 * running Prometheus. The three core metric types are supported — Counter,
 * Gauge and Histogram — with label sets, which covers everything the services
 * need.
 *
 * Usage:
 *   const registry = new MetricsRegistry();
 *   const reqs = registry.counter({
 *     name: 'http_requests_total',
 *     help: 'Total HTTP requests',
 *     labelNames: ['method', 'status'],
 *   });
 *   reqs.inc({ method: 'GET', status: '200' });
 *   const body = registry.render(); // Prometheus text exposition format
 */

export type Labels = Record<string, string>;

interface MetricOptions {
  name: string;
  help: string;
  labelNames?: string[];
}

/** Serialize a label set into a stable key so the same labels map to one series. */
function labelKey(labelNames: string[], labels: Labels): string {
  return labelNames.map((name) => `${name}=${labels[name] ?? ''}`).join(',');
}

/** Render the `{label="value",...}` suffix for a single series line. */
function renderLabels(labelNames: string[], labels: Labels, extra?: Labels): string {
  const pairs: string[] = [];
  for (const name of labelNames) {
    pairs.push(`${name}="${escapeLabelValue(labels[name] ?? '')}"`);
  }
  if (extra) {
    for (const [name, value] of Object.entries(extra)) {
      pairs.push(`${name}="${escapeLabelValue(value)}"`);
    }
  }
  return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

abstract class Metric {
  readonly name: string;
  readonly help: string;
  readonly labelNames: string[];

  constructor(options: MetricOptions) {
    this.name = options.name;
    this.help = options.help;
    this.labelNames = options.labelNames ?? [];
  }

  abstract readonly type: string;
  abstract render(): string;

  protected header(): string {
    return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} ${this.type}`].join('\n');
  }
}

/** Monotonically increasing counter. */
export class Counter extends Metric {
  readonly type = 'counter';
  private values = new Map<string, { labels: Labels; value: number }>();

  inc(labels: Labels = {}, value = 1): void {
    if (value < 0) {
      throw new Error('Counter can only be incremented by a non-negative amount');
    }
    const key = labelKey(this.labelNames, labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { labels, value });
    }
  }

  get(labels: Labels = {}): number {
    return this.values.get(labelKey(this.labelNames, labels))?.value ?? 0;
  }

  render(): string {
    const lines = [this.header()];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    }
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${renderLabels(this.labelNames, labels)} ${value}`);
    }
    return lines.join('\n');
  }
}

/** Value that can go up and down (e.g. in-flight requests, circuit state). */
export class Gauge extends Metric {
  readonly type = 'gauge';
  private values = new Map<string, { labels: Labels; value: number }>();

  set(labels: Labels = {}, value: number): void {
    this.values.set(labelKey(this.labelNames, labels), { labels, value });
  }

  inc(labels: Labels = {}, value = 1): void {
    const key = labelKey(this.labelNames, labels);
    const existing = this.values.get(key);
    this.values.set(key, { labels, value: (existing?.value ?? 0) + value });
  }

  dec(labels: Labels = {}, value = 1): void {
    this.inc(labels, -value);
  }

  get(labels: Labels = {}): number {
    return this.values.get(labelKey(this.labelNames, labels))?.value ?? 0;
  }

  render(): string {
    const lines = [this.header()];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    }
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${renderLabels(this.labelNames, labels)} ${value}`);
    }
    return lines.join('\n');
  }
}

/** Default latency buckets (seconds), tuned for typical HTTP/RPC latencies. */
export const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface HistogramOptions extends MetricOptions {
  buckets?: number[];
}

/** Distribution of observed values, bucketed for quantile estimation. */
export class Histogram extends Metric {
  readonly type = 'histogram';
  private readonly buckets: number[];
  private series = new Map<
    string,
    { labels: Labels; counts: number[]; sum: number; count: number }
  >();

  constructor(options: HistogramOptions) {
    super(options);
    // Buckets must be sorted ascending; +Inf is implicit and added at render.
    this.buckets = [...(options.buckets ?? DEFAULT_BUCKETS)].sort((a, b) => a - b);
  }

  observe(labels: Labels = {}, value: number): void {
    const key = labelKey(this.labelNames, labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { labels, counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.series.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    this.buckets.forEach((upperBound, i) => {
      if (value <= upperBound) {
        entry.counts[i] = (entry.counts[i] ?? 0) + 1;
      }
    });
  }

  render(): string {
    const lines = [this.header()];
    for (const { labels, counts, sum, count } of this.series.values()) {
      this.buckets.forEach((upperBound, i) => {
        lines.push(
          `${this.name}_bucket${renderLabels(this.labelNames, labels, {
            le: String(upperBound),
          })} ${counts[i] ?? 0}`,
        );
      });
      lines.push(
        `${this.name}_bucket${renderLabels(this.labelNames, labels, { le: '+Inf' })} ${count}`,
      );
      lines.push(`${this.name}_sum${renderLabels(this.labelNames, labels)} ${sum}`);
      lines.push(`${this.name}_count${renderLabels(this.labelNames, labels)} ${count}`);
    }
    return lines.join('\n');
  }
}

/**
 * Holds a set of metrics and renders them in Prometheus text format.
 *
 * The factory methods (`counter`/`gauge`/`histogram`) are idempotent: calling
 * them twice with the same name returns the already-registered instance, so
 * modules can grab "their" metric without coordinating a single definition
 * site.
 */
export class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  counter(options: MetricOptions): Counter {
    return this.getOrCreate(options.name, () => new Counter(options), Counter);
  }

  gauge(options: MetricOptions): Gauge {
    return this.getOrCreate(options.name, () => new Gauge(options), Gauge);
  }

  histogram(options: HistogramOptions): Histogram {
    return this.getOrCreate(options.name, () => new Histogram(options), Histogram);
  }

  private getOrCreate<T extends Metric>(
    name: string,
    create: () => T,
    ctor: new (...args: never[]) => T,
  ): T {
    const existing = this.metrics.get(name);
    if (existing) {
      if (!(existing instanceof ctor)) {
        throw new Error(`Metric "${name}" already registered with a different type`);
      }
      return existing;
    }
    const metric = create();
    this.metrics.set(name, metric);
    return metric;
  }

  /** Render all registered metrics in Prometheus text exposition format. */
  render(): string {
    return Array.from(this.metrics.values())
      .map((metric) => metric.render())
      .join('\n\n')
      .concat('\n');
  }

  /** The content type Prometheus expects for the exposition format. */
  static readonly CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

  /** Remove all metrics — primarily for test isolation. */
  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Process-wide default registry. Services scrape this from `/metrics`. Tests
 * that need isolation should construct their own `MetricsRegistry`.
 */
export const defaultRegistry = new MetricsRegistry();
