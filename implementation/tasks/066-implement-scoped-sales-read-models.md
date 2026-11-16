# TASK-066 — Implement Scoped Sales Read Models

## Status

COMPLETED

## Goal

Build PostgreSQL materialized views and query services for daily sales, revenue, top sellers, and store performance summaries.

## Why This Task Exists

Provides sub-20ms dashboard query performance without executing heavy analytical aggregations against live OLTP order tables.

## Requirement References

- AD-2
- REQ-ENG-002
- PRD Section 6.7

## Dependencies

### Blocked By
- TASK-046
- TASK-051
- TASK-060

### Blocks
- TASK-067
- TASK-082

## Architecture References

- ARCHITECTURE.md -> Operations
- docs/modules/reporting.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs materialized view design, unique indexes, and CONCURRENTLY refresh scripts.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use REFRESH MATERIALIZED VIEW CONCURRENTLY
  - Add unique index on view primary keys

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/commerce/schema.ts`
- `packages/backend/src/payments/schema.ts`
- `docs/modules/reporting.md`

## Current Behavior

Not implemented. Analytics and reporting require expensive multi-table joins on orders and seller_orders.

## Required Behavior

Materialized views aggregate daily GMV, order volume, and top-selling variants; refreshed periodically via worker job; queried with strict store scoping.

## Inputs / Outputs / Contracts

StoreAnalyticsSummaryDto, PlatformAnalyticsSummaryDto in @shopscale/contracts.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0023-reporting-views.sql creating materialized views mv_daily_sales and mv_store_performance.
2. Add unique index on mv_daily_sales(day, store_id) enabling concurrent refreshes.
3. Implement AnalyticsQueryService in packages/backend/src/reporting/analytics.service.ts.
4. Schedule BullMQ repeatable job 'refresh-materialized-views' in apps/worker running hourly.
5. Write integration tests in tests/integration/reporting-views.spec.ts.

## Data / Database Changes

Creates materialized views mv_daily_sales and mv_store_performance in migration 0023-reporting-views.sql.

## Security Requirements

Enforces store scoping: seller analytics query strictly filters by WHERE store_id = :sessionStoreId.

## Error Handling

Falls back to previous view snapshot if concurrent refresh experiences lock contention.

## Edge Cases

- Refreshing view with zero orders (handles empty set cleanly)

## Observability

Records materialized view refresh duration in Prometheus.

## Tests Required

### Unit
- packages/backend/src/reporting/analytics.service.test.ts (date range bounding, query filter composition)

### Integration
- tests/integration/reporting-views.spec.ts (seed 100 orders; refresh view; query store analytics; assert GMV sums match)

### End-to-End
- None.

### Security / Regression
- Assert seller cannot view platform-wide GMV or another store's revenue

Do not mark the task complete until required tests pass.

## Manual Verification

Execute REFRESH MATERIALIZED VIEW mv_daily_sales in psql; verify query SELECT * FROM mv_daily_sales returns formatted daily revenue.

## Definition of Done

- [x] Required skills inspected and activated
- [x] Requirement behavior implemented
- [x] Architecture rules followed
- [x] Security requirements satisfied
- [x] Tests added
- [x] Relevant tests pass
- [x] Lint passes
- [x] Typecheck passes
- [x] Build passes
- [x] Documentation updated where required
- [x] Requirement traceability updated
- [x] Independent review completed according to risk
- [x] No unresolved blocking review findings
- [x] Manual verification completed when required

## Independent Review Requirement

Risk Level:
LOW

Review requirements:
Single review pass focusing on unique index creation and concurrent refresh safety. Documented in docs/reviews/t066-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(reporting): implement materialized sales views and analytics query service`

Only commit a meaningful green change.

## Completion Report

When finished, report:

- files changed,
- migrations created,
- tests added,
- commands executed,
- test results,
- assumptions,
- known limitations,
- review status,
- manual verification status.

Do not simply report "done."
