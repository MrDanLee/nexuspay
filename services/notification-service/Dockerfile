# Multi-stage build for the notification service.
# Build context is the repo root: docker build -f services/notification-service/Dockerfile .

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/notification-service/package.json services/notification-service/
RUN npm install

COPY packages/shared packages/shared
COPY services/notification-service services/notification-service

RUN npm run build --workspace @nexuspay/shared \
  && npm run build --workspace @nexuspay/notification-service \
  && npm prune --omit=dev

# ---- production ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nexuspay && adduser -S nexuspay -G nexuspay

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/services/notification-service/package.json ./services/notification-service/package.json
COPY --from=build /app/services/notification-service/dist ./services/notification-service/dist

USER nexuspay
EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "services/notification-service/dist/server.js"]
