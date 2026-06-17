# 5. PostgreSQL over MongoDB

- Status: Accepted
- Date: 2026-02-20

## Context

The system handles money: orders, payments, refunds and stock reservations.
These need strong consistency, multi-row atomic writes (e.g. order + items +
outbox in one transaction), and correctness under concurrency (no overselling
the last unit of stock).

## Decision

Use **PostgreSQL** as the datastore for every service, with a database per
service. The relational model and ACID transactions are leveraged directly:

- multi-statement transactions for the transactional outbox and order/item
  writes;
- optimistic locking via a `version` column for normal updates;
- pessimistic locking (`SELECT ... FOR UPDATE`) for high-contention stock
  reservations;
- `jsonb` columns where a flexible shape is genuinely useful (payloads,
  metadata, addresses).

## Consequences

- Strong consistency and real transactions where the domain demands them; no
  application-level invariant juggling.
- Mature tooling: migrations (knex), connection pooling, rich indexing.
- Each service owns its own database — no cross-service queries; data is shared
  via events, reinforcing [[001-choreography-based-saga]].
- Horizontal write scaling is harder than with a document store, which is an
  acceptable trade-off for a payments domain that values correctness over raw
  write throughput.
