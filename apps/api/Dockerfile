# Multi-stage production Dockerfile for @shopscale/api (TASK-086)
# Security: Runs as unprivileged 'node' user (UID 1000)

# Stage 1: Build & bundle
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/config/package.json ./packages/config/
COPY packages/backend/package.json ./packages/backend/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY tsconfig.json ./

RUN pnpm --filter=@shopscale/contracts run build
RUN pnpm --filter=@shopscale/config run build
RUN pnpm --filter=@shopscale/backend run build
RUN pnpm --filter=@shopscale/api run build

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Run as unprivileged node user
USER node

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages ./packages
COPY --chown=node:node --from=builder /app/apps/api ./apps/api

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health/live || exit 1

CMD ["node", "apps/api/dist/main.js"]
