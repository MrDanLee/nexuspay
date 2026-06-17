# 2. Transactional outbox for reliable event publishing

- Status: Accepted
- Date: 2026-02-21

## Context

The saga depends on events actually being published. Writing to the database
and publishing to RabbitMQ are two separate systems: if a service commits an
order but crashes before publishing `order.created`, the saga stalls; if it
publishes first and then the commit fails, it has lied about state. There is no
shared transaction across PostgreSQL and RabbitMQ.

## Decision

Use the **transactional outbox** pattern. Domain events are written to an
`outbox_events` table in the *same database transaction* as the aggregate
change. A separate poller reads unpublished rows on an interval, publishes them
to RabbitMQ with publisher confirms, and only then marks them published.

This gives at-least-once delivery without a distributed transaction. Publishing
stops at the first failure in a batch so ordering is preserved and the failed
event is retried on the next poll.

## Consequences

- Event publication is atomic with the state change that produced it — no lost
  or phantom events.
- Delivery is at-least-once, so all consumers must be idempotent.
- A small publish latency is introduced (poll interval) and the outbox table
  needs periodic pruning of published rows.
- The poller carries the originating trace context (a `traceparent` stored on
  the outbox row) so traces survive the asynchronous hop.

See also [[001-choreography-based-saga]].
