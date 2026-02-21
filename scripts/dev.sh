#!/bin/bash
set -e

echo "========================================="
echo "  NexusPay — Development Mode"
echo "========================================="
echo ""
echo "Make sure infrastructure is running:"
echo "  docker compose up -d"
echo ""
echo "Starting all services..."
echo ""

npx concurrently \
  --names "order,payment,inventory,notif,audit" \
  --prefix-colors "blue,green,yellow,magenta,cyan" \
  "npm run dev -w @nexuspay/order-service" \
  "npm run dev -w @nexuspay/payment-service" \
  "npm run dev -w @nexuspay/inventory-service" \
  "npm run dev -w @nexuspay/notification-service" \
  "npm run dev -w @nexuspay/audit-service"