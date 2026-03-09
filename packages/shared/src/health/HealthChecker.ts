/**
 * Health check aggregator for Kubernetes probes.
 *
 * Services register their dependency checks (database, Redis, RabbitMQ).
 * The health checker runs all checks and reports overall status.
 *
 * Kubernetes uses two types of probes:
 * - Liveness:  "Is the process alive?" (restart if not)
 * - Readiness: "Can it handle traffic?" (stop sending requests if not)
 *
 * Usage:
 *   const health = new HealthChecker();
 *   health.register('database', async () => { await db.query('SELECT 1'); });
 *   health.register('redis', async () => { await redis.ping(); });
 *
 *   app.get('/health/ready', async (req, res) => {
 *     const result = await health.check();
 *     res.status(result.status === 'healthy' ? 200 : 503).json(result);
 *   });
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  checks: DependencyCheck[];
  timestamp: string;
  uptime: number;
}

export interface DependencyCheck {
  name: string;
  status: 'up' | 'down';
  duration_ms: number;
  error?: string;
}

export class HealthChecker {
  private checks = new Map<string, () => Promise<void>>();
  private startTime = Date.now();

  /**
   * Register a health check function for a dependency.
   * The function should throw an error if the dependency is unhealthy.
   */
  register(name: string, checkFn: () => Promise<void>): void {
    this.checks.set(name, checkFn);
  }

  /**
   * Run all registered health checks and return aggregated result.
   * Each check has a 5-second timeout to prevent hanging.
   */
  async check(): Promise<HealthCheckResult> {
    const results: DependencyCheck[] = [];

    for (const [name, checkFn] of this.checks) {
      const start = Date.now();
      try {
        await Promise.race([
          checkFn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout (5s)')), 5000),
          ),
        ]);
        results.push({
          name,
          status: 'up',
          duration_ms: Date.now() - start,
        });
      } catch (error) {
        results.push({
          name,
          status: 'down',
          duration_ms: Date.now() - start,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const downCount = results.filter((r) => r.status === 'down').length;
    let status: HealthStatus;

    if (downCount === 0) {
      status = 'healthy';
    } else if (downCount < results.length) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      checks: results,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}