import { DomainEvent, Logger } from '@nexuspay/shared';

import { ConsumeOnceGuard } from '../../application/ConsumeOnceGuard';
import { NotificationDispatcher } from '../../application/NotificationDispatcher';

/**
 * Consumes customer-facing domain events and dispatches notifications.
 *
 * Each event is claimed through the consume-once guard first, so a redelivery
 * does not produce a duplicate notification.
 */
export class NotificationEventHandlers {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly guard: ConsumeOnceGuard,
    private readonly logger: Logger,
  ) {}

  handle = async (event: DomainEvent): Promise<void> => {
    const first = await this.guard.claim(event.id);
    if (!first) {
      this.logger.debug({ eventId: event.id, type: event.type }, 'Duplicate event, skipping');
      return;
    }

    this.dispatcher.dispatch(event);
  };
}
