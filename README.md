# NexusPay

[![CI](https://github.com/MrDanLee/nexuspay/actions/workflows/ci.yml/badge.svg)](https://github.com/MrDanLee/nexuspay/actions/workflows/ci.yml)

Distributed payment and order processing system built with TypeScript, Node.js, and event-driven architecture.

## What is this?

NexusPay is a backend system that handles the full lifecycle of e-commerce transactions: order creation, inventory reservation, payment processing, and notification delivery. It demonstrates production-grade distributed systems patterns including choreographed sagas with compensation, the transactional outbox, circuit breakers, and idempotent APIs.

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

# One command: start infrastructure, install, migrate, and seed
./scripts/setup.sh

# Start all services in development mode
npm run dev
```

`setup.sh` starts only the infrastructure containers and runs migrations, so
the services run on the host via `npm run dev`. To run the **entire stack** in
containers instead (services included), use the full-stack compose:

```bash
docker compose up -d --build
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

## Deployment

### Docker

Each service has a multi-stage `Dockerfile` (build context = repo root) that
compiles the shared package and the service, then ships a slim non-root image
with a `/health/live` healthcheck:

```bash
docker build -f services/order-service/Dockerfile -t nexuspay/order-service .
```

`docker compose up -d --build` builds and runs the whole stack (services +
infrastructure) with dependency health gating.

### Kubernetes

Manifests live under `k8s/`, organized as a Kustomize base with environment
overlays:

```
k8s/
├── base/                  # namespace, config, secret, deployments,
│                          # services, infrastructure, network policies
└── overlays/
    ├── development/       # single replicas, reduced resources
    └── production/        # higher replicas + HPAs
```

Render or apply an overlay:

```bash
# Preview the rendered manifests
kubectl kustomize k8s/overlays/development

# Apply to the current cluster (e.g. minikube / kind)
kubectl apply -k k8s/overlays/development

# Production overlay (adds HPAs for order and payment)
kubectl apply -k k8s/overlays/production
```

For an inner-loop dev experience on minikube/kind, `skaffold dev` builds the
images, deploys the development overlay, watches for changes, and port-forwards
each service to localhost:

```bash
skaffold dev
```

Useful operations:

```bash
kubectl -n nexuspay get pods,svc,hpa
kubectl -n nexuspay logs deploy/order-service -f
kubectl -n nexuspay rollout status deploy/order-service
```

## Testing

```bash
# Unit tests (no Docker needed) — runs across all workspaces
npm test

# A single workspace
npm test --workspace @nexuspay/order-service
```

Integration and end-to-end tests are gated behind environment flags so the
default run stays green without infrastructure:

```bash
# Integration tests (real PostgreSQL / RabbitMQ via docker compose)
RUN_INTEGRATION_DB=1 RUN_INTEGRATION_RABBIT=1 RUN_INTEGRATION_SAGA=1 npm test

# End-to-end tests against the running full stack
docker compose up -d --build
RUN_E2E=1 npm run test:e2e
```

## Documentation

- **API** — [OpenAPI 3.0 spec](docs/api/openapi.yaml)
- **Architecture decisions** — [ADRs](docs/adr/README.md)
- **Operations** — [Runbook](docs/runbook.md)

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
├── infra/                   # Prometheus and Grafana configs
├── k8s/                     # Kubernetes manifests (Kustomize base + overlays)
├── scripts/                 # setup and dev helper scripts
├── docs/                    # Architecture decisions, runbooks
├── skaffold.yaml            # Local Kubernetes dev loop
├── docker-compose.yml       # Full stack (services + infrastructure)
└── docker-compose.observability.yml  # Prometheus, Grafana, Jaeger
```

## License

MIT