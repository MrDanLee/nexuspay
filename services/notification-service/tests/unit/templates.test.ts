import { EventType } from '@nexuspay/shared';

import { renderNotification, templateFor } from '../../src/templates';
import { render } from '../../src/templates/renderer';

describe('render', () => {
  it('interpolates simple placeholders', () => {
    expect(render('Hello {{ name }}', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('resolves dotted paths', () => {
    expect(render('{{ order.id }}', { order: { id: 'o-1' } })).toBe('o-1');
  });

  it('renders missing values as empty strings', () => {
    expect(render('[{{ missing }}]', {})).toBe('[]');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(render('{{name}} / {{   name   }}', { name: 'x' })).toBe('x / x');
  });
});

describe('renderNotification', () => {
  it('renders the order confirmed template', () => {
    const result = renderNotification(EventType.ORDER_CONFIRMED, {
      orderId: 'o-1',
      customerId: 'c-1',
      totalAmount: 42,
      currency: 'USD',
    });

    expect(result).toBeDefined();
    expect(result?.channel).toBe('email');
    expect(result?.subject).toBe('Your order o-1 is confirmed');
    expect(result?.body).toContain('42 USD');
  });

  it('renders the payment failed template with a reason', () => {
    const result = renderNotification(EventType.PAYMENT_FAILED, {
      orderId: 'o-9',
      reason: 'card declined',
    });

    expect(result?.subject).toContain('o-9');
    expect(result?.body).toContain('card declined');
  });

  it('returns undefined for an event type without a template', () => {
    expect(renderNotification(EventType.INVENTORY_RESERVED, {})).toBeUndefined();
    expect(templateFor(EventType.INVENTORY_RESERVED)).toBeUndefined();
  });
});
