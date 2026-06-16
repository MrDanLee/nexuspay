import Redis from 'ioredis';
import { Logger } from 'pino';

/**
 * Redis client wrapper with typed operations and health checks.
 *
 * Wraps ioredis with logging, serialization helpers, and a
 * health check method for Kubernetes readiness probes.
 */
export class RedisClient {
  private client: Redis;
  private readonly logger: Logger;
  private loggedError = false;

  constructor(url: string, logger: Logger) {
    this.logger = logger;
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      this.loggedError = false;
      this.logger.info('Connected to Redis');
    });

    // Redis emits 'error' on every retry tick; log only the first one in a
    // failure streak to avoid flooding the logs, and at warn level since
    // callers (idempotency, rate limiter) fail open when Redis is down.
    this.client.on('error', (err) => {
      if (!this.loggedError) {
        this.loggedError = true;
        this.logger.warn(
          { err },
          'Redis unavailable; features backed by Redis will fall back gracefully',
        );
      }
    });

    this.client.on('reconnecting', () => {
      this.logger.warn('Reconnecting to Redis...');
    });
  }

  /**
   * Establish the connection.
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Get a value and deserialize from JSON.
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Set a value with optional TTL (in seconds).
   * Values are automatically serialized to JSON.
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Delete a key.
   */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Get the underlying ioredis client for advanced operations
   * (sorted sets, lua scripts, etc.)
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Check if Redis is reachable (for health checks).
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Gracefully close the connection.
   */
  async close(): Promise<void> {
    await this.client.quit();
    this.logger.info('Redis connection closed');
  }
}