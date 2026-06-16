import { RedisClient, Logger } from '@nexuspay/shared';

/**
 * Best-effort consume-once guard backed by Redis.
 *
 * Notifications are delivered at-least-once by the broker, so a duplicate
 * would otherwise send a second email. We record processed event ids with
 * SET NX and skip anything already seen. This fails open: if Redis is
 * unavailable we proceed (better a rare duplicate notification than none).
 */
export class ConsumeOnceGuard {
  constructor(
    private readonly redis: RedisClient,
    private readonly ttlSeconds: number,
    private readonly logger: Logger,
  ) {}

  /** Returns true if this is the first time we've seen the event id. */
  async claim(eventId: string): Promise<boolean> {
    try {
      const result = await this.redis
        .getClient()
        .set(`notif:seen:${eventId}`, '1', 'EX', this.ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.warn({ err, eventId }, 'Dedup check failed; proceeding (fail open)');
      return true;
    }
  }
}
