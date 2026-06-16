# NexusPay

Distributed payment and order processing system built with TypeScript, Node.js, and event-driven architecture.

> **Status:** Under active development

## What is this?

NexusPay is a backend system that handles the full lifecycle of e-commerce transactions: order creation, inventory reservation, payment processing, and notification delivery. It demonstrates production-grade distributed systems patterns including saga orchestration, event sourcing, circuit breakers, and idempotent APIs.

This is not a CRUD application. It solves real problems that arise when multiple services need to coordinate transactional workflows reliably.

## Architecture
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Order     │     │   Payment    │     │  Inventory   │
│   Service    │     │   Service    │     │   Service    │
│              │     │              │     │              │
│ Saga Orch.   │     │ Circuit Brk. │     │ Pessimistic  │
│ Outbox Pat.  │     │ Retry+Backoff│     │ Locking      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────┬───────┴────────────────────┘
                    │
            ┌───────▼────────┐
            │   RabbitMQ     │     ┌──────────────┐
            │                │────▶│ Notification │
            │ Topic Exchange │     │   Service    │
            │ Dead Letter Q  │     └──────────────┘
            └───────┬────────┘
                    │              ┌──────────────┐
                    └─────────────▶│    Audit     │
                                   │   Service    │
                                   └──────────────┘
       ┌─────────────────────────────────┐
       │         Infrastructure          │
       │  PostgreSQL · Redis · RabbitMQ  │
       │  Prometheus · Grafana · OTel    │
       └─────────────────────────────────┘
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 20, TypeScript 5 (strict) | Type-safe backend development |
| API | Express.js | HTTP layer |
| Database | PostgreSQL 16 | ACID transactions for financial data |
| Message Broker | RabbitMQ 3.13 | Async event-driven communication |
| Cache | Redis 7 | Rate limiting, idempotency, distributed locks |
| Orchestration | Kubernetes (minikube) | Container orchestration |
| CI/CD | GitHub Actions | Automated testing and deployment |
| Observability | Prometheus, Grafana, OpenTelemetry | Metrics, dashboards, distributed tracing |
| Testing | Jest, Testcontainers | Unit, integration, and E2E tests |

## Key Patterns Implemented

- **Saga Orchestrator** — Coordinates distributed transactions across services with compensating actions on failure
- **Outbox Pattern** — Guarantees at-least-once event delivery without distributed transactions
- **Circuit Breaker** — Prevents cascading failures when the payment gateway is down
- **Idempotency** — Every mutating endpoint safely handles retries via `Idempotency-Key` header
- **CQRS** — Separate read and write models for order queries
- **Cursor Pagination** — Efficient pagination for large datasets
- **Event-Driven Architecture** — Services communicate exclusively through domain events

## Quick Start

### Prerequisites

- Node.js >= 20
- Docker and Docker Compose
- npm >= 10

### Setup
```bash
# Clone the repository
git clone https://github.com/MrDanLee/nexuspay.git
cd nexuspay

# Start infrastructure (PostgreSQL, Redis, RabbitMQ)
docker compose up -d

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Start all services in development mode
npm run dev
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| Order Service | 3001 | Order lifecycle and saga orchestration |
| Payment Service | 3002 | Payment processing with circuit breaker |
| Inventory Service | 3003 | Stock management with concurrent-safe operations |
| Notification Service | 3004 | Event-driven notifications |
| Audit Service | 3005 | Immutable event audit trail |

### Infrastructure

| Service | Port | Access |
|---------|------|--------|
| RabbitMQ Management | 15672 | http://localhost:15672 (nexuspay/nexuspay_dev) |
| Redis | 6379 | `redis-cli` |

## Observability

NexusPay emits Prometheus metrics, structured logs, and distributed-trace
context out of the box.

### Metrics

Each service exposes a Prometheus scrape endpoint at `/metrics`:

- **RED metrics** (every request) — `http_requests_total`,
  `http_request_duration_seconds` (histogram), `http_active_requests`. The
  `route` label uses the matched Express route pattern (e.g.
  `/api/v1/orders/:id`) to keep cardinality bounded.
- **Business metrics** — `orders_created_total`, `orders_confirmed_total`,
  `orders_cancelled_total` (by reason); `payment_succeeded_total`,
  `payment_failed_total`, `payment_circuit_breaker_state`.

### Tracing

Every request derives a [W3C Trace Context](https://www.w3.org/TR/trace-context/)
from the inbound `traceparent` header (or starts a new trace), echoes it on the
response, and includes `traceId`/`spanId` on every log line. The trace is
carried across RabbitMQ via the `traceparent` message header — including events
relayed by the order outbox — so a single trace spans the whole saga.

### Running the monitoring stack

The monitoring stack runs independently of the application infrastructure:

```bash
docker compose -f docker-compose.observability.yml up -d
```

| Tool | Port | Access |
|------|------|--------|
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3000 | http://localhost:3000 (admin/admin) |
| Jaeger UI | 16686 | http://localhost:16686 |

Grafana auto-provisions the Prometheus datasource and the **NexusPay — Overview**
dashboard (request/error rates, latency percentiles, order and payment rates,
circuit-breaker state). Prometheus loads alert rules for high error rate, high
p95 latency, and an open payment circuit breaker.

## Project Structure
```
nexuspay/
├── services/
│   ├── order-service/       # Saga orchestrator, order CRUD
│   ├── payment-service/     # Payment gateway, circuit breaker
│   ├── inventory-service/   # Stock reservation, concurrency control
│   ├── notification-service/# Event-driven notifications
│   └── audit-service/       # Immutable audit trail
├── packages/
│   └── shared/              # Common utilities, types, middleware
├── infra/                   # Docker, Kubernetes, monitoring configs
├── docs/                    # Architecture decisions, runbooks
└── docker-compose.yml       # Local infrastructure
```

## License

MIT