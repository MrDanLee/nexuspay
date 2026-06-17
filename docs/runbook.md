# NexusPay Operational Runbook

Practical procedures for operating and troubleshooting NexusPay. Commands
assume the local stack (docker compose) or a Kubernetes deployment; adjust
hostnames/credentials per environment.

## Quick reference

| Concern | Where to look |
|---------|---------------|
| One order's flow | `GET /api/v1/orders/{id}/timeline` and `GET /api/v1/audit/orders/{id}` |
| Saga step status | `saga_steps` table (order DB) |
| Stuck/failed messages | Dead-letter queue `nexuspay.dlq` (RabbitMQ UI :15672) |
| Gateway health | `payment_circuit_breaker_state` metric / Grafana overview |
| Error rate & latency | Grafana **NexusPay — Overview**, Prometheus alerts |
| Logs | Structured JSON; filter by `traceId` / `correlationId` |

## Investigating a failed or stuck saga

1. **Get the order's view of the flow.** Call
   `GET /api/v1/orders/{id}/timeline` — it returns the order status plus each
   `saga_steps` entry (step name, status, retry count, timing).
2. **Cross-check the event history.** Call `GET /api/v1/audit/orders/{id}` for
   the immutable list of every event recorded for that order across services.
   Compare against the expected flow (see
   [ADR 001](adr/001-choreography-based-saga.md)):
   `order.created → inventory.reserved → payment.completed → order.confirmed`.
3. **Find the gap.** The last successful event tells you which service to look
   at next:
   - no `inventory.reserved` / saw `inventory.failed` → insufficient stock;
     order should be `INVENTORY_FAILED`/`CANCELLED`.
   - `inventory.reserved` but no `payment.completed` → check the payment
     service and the gateway (see below).
   - `payment.failed` → order should be cancelled and stock released
     (`inventory.released`).
4. **Trace it.** Grab the `traceId` from any related log line and filter logs
   across services to follow the request end to end (the trace propagates over
   HTTP and through RabbitMQ headers).

## Draining / inspecting the dead-letter queue

Messages that fail processing twice are dead-lettered to `nexuspay.dlq`.

1. Open the RabbitMQ management UI at `http://localhost:15672`
   (user/pass: `nexuspay` / `nexuspay_dev` locally).
2. Inspect `nexuspay.dlq` → **Get messages** to see payloads and the
   `x-death` header (original queue, reason, count).
3. After fixing the root cause, **re-publish** the message to its original
   exchange/routing key (Shovel plugin, or move via the UI), or acknowledge to
   discard if it is truly poison.
4. Confirm the consumer processed it (audit log shows the event, saga advances).

> Consumers are idempotent, so re-delivering an already-processed event is
> safe.

## Manually retrying a payment

1. Confirm the current state: `GET /api/v1/payments/{orderId}`.
2. If the gateway was down, check the breaker: `payment_circuit_breaker_state`
   (0 closed, 1 half-open, 2 open). Wait for it to close, or address the
   gateway outage.
3. Re-trigger processing with a **fresh** `Idempotency-Key` only if no payment
   succeeded; reusing the prior key returns the prior result (by design).
4. Alternatively, re-drive the saga by re-publishing the `inventory.reserved`
   event for the order from the DLQ (idempotent).

## Common scenarios

### High 5xx error rate (`HighErrorRate` alert)
- Identify the service from the alert label and Grafana.
- Check `/health/ready` and recent logs (filter by `traceId` on failing
  requests).
- Common causes: a dependency (DB/Redis/RabbitMQ) is down. Redis-backed
  middleware (idempotency, rate limiting) fails open, so Redis being down
  degrades but should not 5xx.

### Payment circuit breaker open (`PaymentCircuitBreakerOpen` alert)
- The gateway is failing/timing out. Payments fast-fail and the saga emits
  `payment.failed` → orders cancel and stock releases.
- Verify gateway connectivity; the breaker probes and closes automatically once
  calls succeed. No manual reset is required.

### Overselling concerns
- Stock reservations use `SELECT ... FOR UPDATE`; concurrent reservations for
  the last unit are serialized. If counts look wrong, inspect the
  `reservations` table and the reservation-expiry job logs.

### Migrations
- Apply: `npm run migrate --workspace @nexuspay/<service>`.
- The `audit_events` and `outbox_events` tables grow over time — schedule
  pruning of published outbox rows and archival of old audit rows.
