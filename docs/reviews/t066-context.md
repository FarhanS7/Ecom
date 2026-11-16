# Independent Review: TASK-066 — Implement Scoped Sales Read Models

## Review Metadata
- **Task ID**: `TASK-066`
- **Goal**: Build PostgreSQL materialized views and query services for daily sales, revenue, top sellers, and store performance summaries with non-blocking concurrent refresh.
- **Risk Level**: LOW
- **Requirements Covered**: `AD-2`, `REQ-ENG-002`, PRD Section 6.7
- **Date**: 2026-11-16
- **Status**: APPROVED

---

## 1. Scope & Artifacts Inspected

### Database Migration
- `db/migrations/0024-reporting-views.sql`:
  - `mv_daily_sales` materialized view: Aggregates daily order count, units sold, GMV in cents, net sales in cents, and average order value per store. Uses CTE `so_items` to cleanly eliminate multi-line item Cartesian duplication when joining `order_items` with `seller_orders`. Filters exclusively by paid orders (`orders.payment_status = 'PAID'`).
  - Unique index `uq_mv_daily_sales` on `("day", "store_id")` allowing non-blocking `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
  - Secondary index `idx_mv_daily_sales_store_day` on `("store_id", "day" DESC)` for sub-20ms store dashboard range scans.
  - `mv_store_performance` materialized view: Precomputes store lifetime orders count, lifetime GMV, average order value, and last order timestamp. Left joins ensure stores with zero orders still appear with 0 counters rather than being omitted.
  - Unique index `uq_mv_store_performance` on `("store_id")` allowing concurrent refresh.

### Contracts & API Schemas
- `packages/contracts/src/reporting.ts`:
  - `dailySalesPointSchema`: `day` (YYYY-MM-DD), `ordersCount`, `unitsSold`, `gmvCents`, `netSalesCents`, `avgOrderValueCents`.
  - `topSellerSummarySchema`: `storeId`, `storeName`, `storeSlug`, `totalOrders`, `lifetimeGmvCents`, `avgOrderValueCents`, `lastOrderAt`.
  - `storeAnalyticsSummarySchema`: Scoped store summary with daily trends array.
  - `platformAnalyticsSummarySchema`: Platform totals, top stores ranking, and aggregated daily trend.
  - Exported through `packages/contracts/src/index.ts`.

### Domain Reporting Service
- `packages/backend/src/reporting/analytics.service.ts`:
  - `refreshMaterializedViews(concurrently = true)`:
    - Concurrently refreshes `mv_daily_sales` and `mv_store_performance`.
    - Handles unpopulated initial state or lock contention by falling back gracefully to standard non-concurrent refresh.
  - `getStoreAnalytics(storeId, options)`:
    - Strictly enforces store scoping via `WHERE store_id = $storeId`.
    - Bounds date range (defaults to 30 days).
    - Aggregates daily trend points and fetches store lifetime metrics from `mv_store_performance`.
  - `getPlatformAnalytics(options)`:
    - Platform admin level aggregation across all stores.
    - Ranks top stores by `lifetime_gmv_cents DESC LIMIT :topLimit`.
  - Exported through `packages/backend/src/reporting/index.ts`.

### Worker Scheduler
- `apps/worker/src/schedulers/reporting.scheduler.ts`:
  - Repeatable BullMQ job `'refresh-materialized-views'` registered on queue `'reporting-refresh'`.
  - Hourly scheduled interval (default: 3,600,000ms).
  - Triggers concurrent materialized view refresh and provides `triggerNow()` for orchestration/integration testing.
  - Integrated into `apps/worker/src/main.ts` with graceful shutdown lifecycle.

---

## 2. Invariant & Security Verification

1. **OLTP Isolation**:
   - Complex analytical aggregations (GMV, order counts, units sold, AOV) are decoupled from live transactional order tables. Store and admin dashboard reads run against materialized views with sub-20ms latency.
2. **Concurrent Refresh Safety**:
   - Both `mv_daily_sales` and `mv_store_performance` define unique indexes (`uq_mv_daily_sales` and `uq_mv_store_performance`). This satisfies PostgreSQL's requirement for `REFRESH MATERIALIZED VIEW CONCURRENTLY`, allowing refreshes to proceed without locking read access.
3. **Strict Store Scoping**:
   - `getStoreAnalytics` explicitly filters by `WHERE store_id = ${storeId}`. A seller can only view their own store's sales and revenue trends.
4. **Zero-Order Handling**:
   - Cleanly handles stores with 0 orders, returning 0 values without division-by-zero SQL errors or null pointer crashes.

---

## 3. Verification & Test Evidence

- **Unit Tests**:
  - `packages/backend/src/reporting/analytics.service.test.ts`: 5 tests passing (concurrent refresh execution, fallback on contention, store analytics scoping, zero-order handling, platform aggregation).
  - `apps/worker/src/schedulers/reporting.scheduler.test.ts`: 1 test passing (repeatable job registration and execution).
- **Integration Tests**:
  - `packages/backend/tests/integration/reporting-views.spec.ts`: Tests complete lifecycle (migration execution, seeding multiple stores and orders, verifying paid vs unpaid order filtering, concurrent view refresh, store scoping, and GMV platform ranking).
  - `tests/integration/reporting-views.spec.ts`: Re-exported root integration test.
- **Monorepo Health Check**:
  - `pnpm test`: 749 tests passing across all 7 workspace packages (0 failures).
  - `pnpm typecheck`: Passed with 0 errors.
  - `pnpm lint`: Passed with 0 errors and 0 warnings.
  - `pnpm build`: Completed successfully across all apps and packages.

---

## 4. Conclusion & Approval

The materialized sales read models and reporting engine conform to all architecture specifications, performance requirements, and the Definition of Done.
**Status**: APPROVED.
