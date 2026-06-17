#!/bin/bash
#
# NexusPay — seed demo data.
#
# Seeds the product catalog (inventory) and, if the order service is reachable,
# creates a couple of demo orders so the saga has something to process. Run
# after ./scripts/setup.sh (and `npm run dev` or `docker compose up`).
#
# Usage: ./scripts/seed.sh
set -euo pipefail

cd "$(dirname "$0")/.."

ORDER_URL="${ORDER_URL:-http://localhost:3001}"
JWT_SECRET="${JWT_SECRET:-nexuspay-dev-secret-change-in-production-min-32-chars}"

echo "==> Seeding product catalog (inventory)"
npm run seed --workspace @nexuspay/inventory-service

# Mint a short-lived demo customer token using the shared dev secret. The
# subject must be a UUID — it becomes the order's customer_id (a uuid column).
token() {
  node -e "console.log(require('jsonwebtoken').sign({sub:require('crypto').randomUUID(),roles:['customer']}, process.env.JWT_SECRET, {expiresIn:'1h'}))"
}

create_order() {
  local sku="$1" qty="$2"
  curl -fsS -X POST "$ORDER_URL/api/v1/orders" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $(JWT_SECRET="$JWT_SECRET" token)" \
    -H "Idempotency-Key: $(node -e 'console.log(require("crypto").randomUUID())')" \
    -d "{\"currency\":\"USD\",\"items\":[{\"productId\":\"$(node -e 'console.log(require("crypto").randomUUID())')\",\"sku\":\"$sku\",\"quantity\":$qty,\"unitPrice\":100}],\"shippingAddress\":{\"line1\":\"1 Demo St\",\"city\":\"Demo\",\"zip\":\"12345\",\"country\":\"US\"}}" \
    >/dev/null && echo "    created demo order for $sku x$qty"
}

echo "==> Checking order service at $ORDER_URL"
if curl -fsS "$ORDER_URL/health/live" >/dev/null 2>&1; then
  echo "==> Creating demo orders"
  create_order LAPTOP-PRO-15 1 || echo "    (skipped: order creation failed)"
  create_order PHONE-X-256 2 || echo "    (skipped: order creation failed)"
else
  echo "    order service not reachable — skipping demo orders."
  echo "    Start the services (npm run dev) and re-run to create demo orders."
fi

echo ""
echo "Demo data seeded."
