# 4. Circuit breaker for the payment gateway

- Status: Accepted
- Date: 2026-02-21

## Context

The payment service calls an external payment gateway that can slow down or
fail. Without protection, a failing gateway causes every payment attempt to
hang and retry, exhausting connections and threads and turning a downstream
outage into a payment-service outage (cascading failure).

## Decision

Wrap gateway calls in a **circuit breaker** (CLOSED → OPEN → HALF_OPEN). After
a threshold of failures the breaker opens and fails fast for a cooldown window,
then allows a probe (HALF_OPEN) before closing again. It is combined with
**retry + exponential backoff with jitter** for transient errors.

Only *retryable* failures (5xx / timeout) count toward the breaker and are
retried; 4xx responses are treated as terminal and do not trip it. The breaker
state is exposed as a Prometheus gauge and surfaced on the overview dashboard.

## Consequences

- A gateway outage degrades fast and predictably instead of cascading.
- The breaker state is observable and alertable (`PaymentCircuitBreakerOpen`).
- Tuning thresholds/timeouts is a trade-off between resilience and recovery
  speed; the values are configurable per environment.
- Callers must handle fast-fail rejections (the saga emits `payment.failed` and
  compensates).
