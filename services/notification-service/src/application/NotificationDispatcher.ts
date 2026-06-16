import { DomainEvent, Logger } from '@nexuspay/shared';

import { renderNotification } from '../templates';

/**
 * Renders and "sends" notifications for domain events.
 *
 * Delivery is simulated — the rendered notification is logged rather than
 * emailed — but the rendering and routing logic is real. Events without a
 * matching template are skipped.
 */
export class NotificationDispatcher {
  constructor(private readonly logger: Logger) {}

  /** Returns true if a notification was rendered and dispatched. */
  dispatch(event: DomainEvent): boolean {
    const notification = renderNotification(event.type, event.data as Record<string, unknown>);
    if (!notification) {
      this.logger.debug({ type: event.type }, 'No template for event, skipping');
      return false;
    }

    // Simulated delivery: in production this would call an email/SMS provider.
    this.logger.info(
      {
        eventType: event.type,
        channel: notification.channel,
        subject: notification.subject,
        body: notification.body,
      },
      'Notification sent (simulated)',
    );
    return true;
  }
}
