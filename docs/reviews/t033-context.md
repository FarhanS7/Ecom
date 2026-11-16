# Review: TASK-033 — Scoped Product Caching and Stampede Control

## Scope & Implementation
- **Component**: Redis Cache-Aside with Single-Flight Mutex & Event-Driven Invalidation
- **Files**:
  - `packages/backend/src/platform/cache.service.ts`: `RedisCacheService` with single-flight mutex lock (`SET lock:{key} 1 EX 5 NX`), TTL jitter (+/- 30s), graceful degradation on failure.
  - `packages/backend/src/catalog/read.service.ts`: Wrapped `getChannelProduct` with `redisCacheService.getOrSet('cache:pdp:{channelKey}:{productSlug}', 300, loader)`.
  - `apps/worker/src/consumers/domain-events.consumer.ts`: Invalidation of `cache:pdp:*` on `ProductChanged` and `PublicationChanged` events.
  - `packages/backend/tests/integration/cache-stampede.spec.ts`: Integration test verifying concurrency stampede protection (50 concurrent requests trigger 1 query), fallback resilience, and invalidation.

## Invariant Verification

### 1. Single-Flight Mutex Lock
- On cache miss, `getOrSet` attempts to acquire a 5-second lease via `SET lock:{key} 1 EX 5 NX`.
- Winning worker queries PostgreSQL and writes to Redis before releasing the lock.
- Concurrently waiting requests poll with 50ms backoff up to 8 attempts (400ms max) and read the populated cache.
- Verified in unit test `cache.service.test.ts` and integration test `cache-stampede.spec.ts` with 50 concurrent requests resulting in exactly 1 loader invocation.

### 2. TTL Jitter
- Default TTL is 300 seconds.
- Random jitter of +/- 30 seconds is added (`effectiveTtl = Math.max(10, ttlSeconds + jitter)`) to prevent synchronized mass expiration spikes.

### 3. Graceful Fallback When Redis Fails
- Evaluated when Redis is down, disconnected, or throws connection errors.
- `getOrSet` wraps all Redis operations in `try/catch` and transparently invokes the database loader without throwing 500 errors to the client.
- Verified in `cache-stampede.spec.ts` (`transparently falls back to database if Redis throws errors`).

### 4. Cache Scope & Isolation
- Cache keys are strictly namespaced: `cache:pdp:{channelKey}:{productSlug}`.
- Store channel uses `store:${storeSlug}` ensuring store-isolated product views do not bleed into marketplace or across different tenants.

### 5. Outbox Consumer Invalidation
- When a product mutation occurs and the outbox event (`ProductChanged` / `PublicationChanged`) is relayed to `domain-events` queue, `DomainEventsConsumer` invalidates `cache:pdp:*`.

## Verification Status
- Unit tests: 100% pass (vitest)
- Integration tests: 100% pass (vitest)
- ESLint: 0 errors, 0 warnings
- TypeScript: compiles cleanly across all packages
- Next.js web build: compiles cleanly
