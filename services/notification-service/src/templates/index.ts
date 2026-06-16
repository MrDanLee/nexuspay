import { EventType } from '@nexuspay/shared';

import { render } from './renderer';

export interface NotificationTemplate {
  /** Channel this template targets (email is simulated). */
  channel: 'email';
  subject: string;
  body: string;
}

/**
 * Notification templates keyed by the domain event that triggers them.
 *
 * Only customer-facing outcomes have a template; events without one are
 * ignored by the dispatcher.
 */
const templates: Partial<Record<string, NotificationTemplate>> = {
  [EventType.ORDER_CONFIRMED]: {
    channel: 'email',
    subject: 'Your order {{ orderId }} is confirmed',
    body: 'Hi {{ customerId }}, your order {{ orderId }} for {{ totalAmount }} {{ currency }} has been confirmed and is being prepared.',
  },
  [EventType.ORDER_CANCELLED]: {
    channel: 'email',
    subject: 'Your order {{ orderId }} was cancelled',
    body: 'Hi {{ customerId }}, your order {{ orderId }} was cancelled. Reason: {{ reason }}. No payment has been taken.',
  },
  [EventType.PAYMENT_FAILED]: {
    channel: 'email',
    subject: 'Payment failed for order {{ orderId }}',
    body: 'We could not process the payment for order {{ orderId }}. Reason: {{ reason }}. Please update your payment method and try again.',
  },
};

export interface RenderedNotification {
  channel: 'email';
  subject: string;
  body: string;
}

/** Look up the template for an event type, or undefined if none applies. */
export function templateFor(eventType: string): NotificationTemplate | undefined {
  return templates[eventType];
}

/** Render the template for an event type against its payload. */
export function renderNotification(
  eventType: string,
  data: Record<string, unknown>,
): RenderedNotification | undefined {
  const template = templates[eventType];
  if (!template) return undefined;

  return {
    channel: template.channel,
    subject: render(template.subject, data),
    body: render(template.body, data),
  };
}
