# Multi-stage production Dockerfile for @shopscale/worker (TASK-086)
# Security: Runs as unprivileged 'node' user (UID 1000)

# Stage 1: Build & bundle
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/config/package.json ./packages/config/
COPY packages/backend/package.json ./packages/backend/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
COPY tsconfig.json ./

RUN pnpm --filter=@shopscale/contracts run build
RUN pnpm --filter=@shopscale/config run build
RUN pnpm --filter=@shopscale/backend run build
RUN pnpm --filter=@shopscale/worker run build

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

USER node

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages ./packages
COPY --chown=node:node --from=builder /app/apps/worker ./apps/worker

CMD ["node", "apps/worker/dist/main.js"]
