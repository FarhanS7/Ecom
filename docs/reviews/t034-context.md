# Review: TASK-034 — Implement Safe Full Reindex

## Scope & Implementation
- **Component**: Zero-Downtime Full Search Reindexing CLI & Service
- **Files**:
  - `packages/backend/src/search/reindex.service.ts`: `ReindexService` implementing keyset batch pagination (`WHERE p.id > lastId ORDER BY p.id ASC LIMIT batchSize`) over products, joins with publications and categories, computes visibility and rating aggregations, and performs atomic upserts into `search_documents`.
  - `scripts/reindex.ts`: Operational CLI tool supporting `--batch-size=500` and `--store=slug` flags, rendering real-time batch progress and throughput summary.
  - `package.json`: Added `search:reindex` script.
  - `packages/backend/src/search/reindex.service.test.ts`: Unit tests verifying keyset batch partitioning, store filtering, and empty dataset handling.
  - `packages/backend/tests/integration/reindex.spec.ts`: Integration test verifying full search projection restoration from raw catalog tables and subsequent query recovery.

## Invariant Verification

### 1. Keyset Cursor Batching
- Reindexing avoids deep `OFFSET` pagination, using primary key keyset paging (`WHERE p.id > lastId ORDER BY p.id ASC LIMIT batchSize`).
- Ensures constant $O(1)$ batch fetch latency regardless of total catalog size.

### 2. Zero Search Downtime
- Reindexing uses `INSERT ... ON CONFLICT (product_id) DO UPDATE SET ...` instead of dropping or truncating `search_documents`.
- Search reads continue uninterrupted during reindex runs.

### 3. Concurrency Protection
- The upsert includes `WHERE search_documents.source_version <= EXCLUDED.source_version`.
- If an outbox projection or live product edit runs concurrently with a higher version, the reindex will not regress the document.

### 4. Cache Invalidation
- Upon reindex completion, all PDP cache keys (`cache:pdp:*`) are automatically cleared via `redisCacheService.invalidatePattern('cache:pdp:*')`.

## Verification Status
- Unit tests: 100% pass (vitest)
- Integration tests: 100% pass (vitest)
- ESLint: 0 errors, 0 warnings
- TypeScript & Next.js: compiles cleanly
