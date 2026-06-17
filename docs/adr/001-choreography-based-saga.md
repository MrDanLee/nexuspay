# 1. Choreography-based saga for distributed transactions

- Status: Accepted
- Date: 2026-02-20

## Context

An order spans three services — order, inventory and payment — that each own
their database. We need the create-order flow (reserve stock → take payment →
confirm) to be consistent without a distributed (2PC) transaction, and to
compensate cleanly when a step fails.

Two saga styles were considered:

- **Orchestration**: a central coordinator issues commands to each service and
  tracks the flow.
- **Choreography**: each service reacts to events and emits the next event; no
  central brain.

## Decision

Use a **choreography-based saga** driven by domain events over RabbitMQ topic
exchanges:

```
order.created  -> inventory reserves -> inventory.reserved
inventory.reserved -> payment charges -> payment.completed -> order confirmed
payment.failed / inventory.failed -> order cancelled (compensation)
```

The order service still records each step in a `saga_steps` table for
observability and debugging, but it does not command the other services — they
subscribe and react.

## Consequences

- Services stay loosely coupled and independently deployable; adding a consumer
  (e.g. notifications, audit) needs no change to existing services.
- No single point of failure or orchestration bottleneck.
- The overall flow is implicit in the event bindings rather than in one place,
  so the `saga_steps` timeline and the audit log become important for
  understanding a given order's history.
- Every step must be idempotent (events are delivered at least once) and every
  failure must emit a compensating event.

See also [[002-outbox-pattern-for-reliability]].
