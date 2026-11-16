# TASK-067 — Build Seller and Platform Dashboards

## Status

COMPLETED

## Goal

Build Next.js analytics dashboard pages for sellers (/seller/dashboard) and platform administrators (/admin/dashboard) displaying GMV, orders, and top products.

## Why This Task Exists

Provides merchants and platform operators with visual business intelligence and operational oversight.

## Requirement References

- AD-2
- REQ-ENG-002
- design.md

## Dependencies

### Blocked By
- TASK-062
- TASK-066

### Blocks
- TASK-075

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs dashboard stat cards, responsive charts, and date range filters.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use accessible SVG/CSS charts
  - Format currency in USD with commas

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/seller/products/page.tsx`
- `packages/backend/src/reporting/analytics.service.ts`
- `apps/web/src/components/ui/card.tsx`

## Current Behavior

No analytics dashboards exist; sellers and admins have only raw entity list views.

## Required Behavior

Seller dashboard renders Gross Revenue, Orders Count, Average Order Value, and Top Selling Products; Admin dashboard renders Platform GMV and Merchant leaderboard.

## Inputs / Outputs / Contracts

DashboardStatsProps and RevenueChartProps in apps/web/src/features/dashboard/.

## Implementation Commands

Execute in this order:

1. Build seller dashboard in apps/web/src/app/seller/dashboard/page.tsx.
2. Build admin dashboard in apps/web/src/app/admin/dashboard/page.tsx.
3. Build StatCard component displaying value, trend indicator, and comparison period.
4. Build RevenueBarChart component rendering monthly and weekly sales data.
5. Write component tests and data formatting tests.

## Data / Database Changes

None.

## Security Requirements

Enforces strict RBAC: non-admin cannot access /admin/dashboard; seller sees only their store stats.

## Error Handling

Displays zero-state placeholders with guidance when no sales data exists for selected period.

## Edge Cases

- Selecting date range with zero sales (renders flat zero baseline without breaking chart geometry)

## Observability

Dashboard load latency tracking.

## Tests Required

### Unit
- apps/web/src/features/dashboard/stat-card.test.tsx (currency formatting, percentage trend badges)

### Integration
- apps/web/src/features/dashboard/dashboard-loader.test.ts (fetch analytics data, render cards)

### End-to-End
- tests/e2e/seller-dashboard.spec.ts (log in as seller, navigate to dashboard, verify GMV card renders)

### Security / Regression
- Assert customer account attempting to access /admin/dashboard receives redirect to login or 403

Do not mark the task complete until required tests pass.

## Manual Verification

Visit /seller/dashboard; verify Gross Revenue card displays formatted revenue matching seeded orders.

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
Single review pass focusing on responsive layout and number formatting. Documented in docs/reviews/t067-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build seller analytics dashboard and platform admin gmv overview`

Only commit a meaningful green change.

## Completion Report

- **Files Changed / Created**:
  - `apps/api/src/analytics.controller.ts` (new API controller for store analytics and platform admin analytics)
  - `apps/api/src/analytics.controller.test.ts` (6 controller unit tests)
  - `apps/api/src/app.module.ts` (registered AnalyticsController)
  - `apps/api/src/route-policy.ts` (registered public vs guarded routes for analytics)
  - `docs/openapi.json` (OpenAPI definitions for analytics endpoints)
  - `apps/web/src/lib/api.ts` (gateway allowlist updated for `/v1/admin/analytics` and template for `/v1/seller/stores/{storeId}/analytics`)
  - `apps/web/src/features/dashboard/stat-card.tsx` (accessible metric card with trend indicators)
  - `apps/web/src/features/dashboard/stat-card.test.tsx` (tests for StatCard)
  - `apps/web/src/features/dashboard/revenue-chart.tsx` (responsive bar chart with tooltips)
  - `apps/web/src/features/dashboard/revenue-chart.test.tsx` (tests for RevenueBarChart)
  - `apps/web/src/features/dashboard/dashboard-loader.test.ts` (tests for gateway resolution and data loading)
  - `apps/web/src/app/seller/[storeId]/dashboard/page.tsx` (scoped seller analytics dashboard)
  - `apps/web/src/app/seller/dashboard/page.tsx` (seller dashboard redirector/hub)
  - `apps/web/src/app/admin/dashboard/page.tsx` (platform admin analytics dashboard)
  - `apps/web/src/app/seller/[storeId]/layout.tsx` (added Analytics navigation link)
  - `docs/reviews/t067-context.md` (independent review artifact)
- **Migrations Created**: None (leveraged views from 0024-reporting-views.sql).
- **Tests Added**: 12 unit and integration tests across api and web suites.
- **Commands Executed**:
  - `pnpm --filter=@shopscale/backend build`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm --filter=@shopscale/api test src/analytics.controller.test.ts`
  - `pnpm --filter=@shopscale/web test src/features/dashboard`
  - `pnpm build`
  - `pnpm test`
- **Test Results**: All tests passing across all packages; 0 lint warnings; 0 type errors; Next.js production build succeeds.
- **Assumptions**: Store analytics scoping requires `catalog:manage` permission on the store; admin analytics requires platform admin role.
- **Known Limitations**: Date range filter presets are 7d, 30d, 90d.
- **Review Status**: APPROVED in `docs/reviews/t067-context.md`.
- **Manual Verification Status**: Verified endpoint parameters, gateway routing, and layout responsiveness.
