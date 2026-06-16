import { defaultRegistry, MetricNames } from '@nexuspay/shared';

/**
 * Business metrics for the order service, recorded on the shared default
 * registry so they are exposed alongside the HTTP metrics on /metrics.
 *
 * These are domain-level signals (orders created/confirmed/cancelled) that
 * complement the RED metrics and feed the order-rate panels in Grafana.
 */
const ordersCreated = defaultRegistry.counter({
  name: MetricNames.ORDERS_CREATED_TOTAL,
  help: 'Total number of orders created',
});

const ordersConfirmed = defaultRegistry.counter({
  name: MetricNames.ORDERS_CONFIRMED_TOTAL,
  help: 'Total number of orders confirmed',
});

const ordersCancelled = defaultRegistry.counter({
  name: MetricNames.ORDERS_CANCELLED_TOTAL,
  help: 'Total number of orders cancelled',
  labelNames: ['reason'],
});

export const orderMetrics = {
  recordCreated(): void {
    ordersCreated.inc();
  },
  recordConfirmed(): void {
    ordersConfirmed.inc();
  },
  recordCancelled(reason: string): void {
    ordersCancelled.inc({ reason });
  },
};
