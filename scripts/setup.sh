#!/bin/bash
#
# NexusPay — one-command local setup.
#
# Brings up the infrastructure (PostgreSQL x4, RabbitMQ, Redis), waits for it
# to be healthy, installs dependencies, builds the shared package, runs every
# service's migrations, and seeds demo inventory. After this finishes, start
# the services with `npm run dev`.
#
# Usage: ./scripts/setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

INFRA_SERVICES="postgres-orders postgres-payments postgres-inventory postgres-audit rabbitmq redis"

# ── Prerequisites ───────────────────────────────
require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' is required but not installed." >&2
    exit 1
  fi
}
echo "==> Checking prerequisites"
require docker
require node
require npm

# ── Start infrastructure ────────────────────────
echo "==> Starting infrastructure"
docker compose up -d $INFRA_SERVICES

# ── Wait for health ─────────────────────────────
wait_healthy() {
  local container="$1"
  local attempts=0
  echo -n "    waiting for $container "
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null)" = "healthy" ]; do
    attempts=$((attempts + 1))
    if [ "$attempts" -gt 60 ]; then
      echo " timed out"
      echo "ERROR: $container did not become healthy" >&2
      exit 1
    fi
    echo -n "."
    sleep 2
  done
  echo " ok"
}
echo "==> Waiting for infrastructure to be healthy"
wait_healthy nexuspay-pg-orders
wait_healthy nexuspay-pg-payments
wait_healthy nexuspay-pg-inventory
wait_healthy nexuspay-pg-audit
wait_healthy nexuspay-rabbitmq
wait_healthy nexuspay-redis

# ── Install and build ───────────────────────────
echo "==> Installing dependencies"
npm install

echo "==> Building shared package"
npm run build --workspace @nexuspay/shared

# ── Migrations ──────────────────────────────────
echo "==> Running migrations"
for svc in order payment inventory audit; do
  echo "    - $svc-service"
  npm run migrate --workspace "@nexuspay/${svc}-service"
done

# ── Seed demo data ──────────────────────────────
echo "==> Seeding demo inventory"
npm run seed --workspace @nexuspay/inventory-service

echo ""
echo "Setup complete. Start the services with:"
echo "    npm run dev"
