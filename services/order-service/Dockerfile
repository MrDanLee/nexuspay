# Multi-stage build for the order service.
# Build context is the repo root: docker build -f services/order-service/Dockerfile .
#
# The build stage installs the workspace (shared + this service only),
# compiles the shared package first, then the service, and prunes dev
# dependencies. The production stage carries just the runtime artifacts and
# runs as a non-root user.

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app

# Manifests first for better layer caching.
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/order-service/package.json services/order-service/
RUN npm install

# Sources.
COPY packages/shared packages/shared
COPY services/order-service services/order-service

# Shared must be compiled before the service typechecks against its .d.ts.
RUN npm run build --workspace @nexuspay/shared \
  && npm run build --workspace @nexuspay/order-service \
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
COPY --from=build /app/services/order-service/package.json ./services/order-service/package.json
COPY --from=build /app/services/order-service/dist ./services/order-service/dist

USER nexuspay
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "services/order-service/dist/server.js"]
