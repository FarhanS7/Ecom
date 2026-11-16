# TASK-076 — Add Low-Stock and Feature-Flag Extensions

## Status

COMPLETED

## Goal

Build low-stock seller notification worker (PRD P2: IN-5) and database-driven feature flag engine supporting store allowlists and gradual rollouts (PRD P2: AD-4).

## Why This Task Exists

Completes PRD P2 stretch goals without compromising core V1 stability.

## Requirement References

- IN-5
- AD-4
- PRD Section 6.3
- PRD Section 6.7

## Dependencies

### Blocked By
- TASK-037
- TASK-029

### Blocks
- TASK-088

## Architecture References

- ARCHITECTURE.md -> System shape
- docs/modules/platform.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs feature flag evaluation port and low-stock alert events.
- Installation/activation required: No
- Instructions that apply to this task:
  - Default feature flags to false
  - Support store-scoped allowlists

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/inventory/inventory.service.ts`
- `packages/backend/src/platform/security.ts`
- `docs/architecture/data-model.md`

## Current Behavior

Low-stock conditions do not alert sellers; feature toggles are hardcoded.

## Required Behavior

When available stock drops below threshold (default 5), LowStockAlert event is emitted to notify seller; FeatureFlagService evaluates flag state per store and percentage rollout.

## Inputs / Outputs / Contracts

feature_flags: (key text PK, enabled boolean, store_allowlist JSONB, version int). FeatureFlagPort.isEnabled(flagKey, storeId).

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0025-feature-flags.sql creating feature_flags table.
2. Implement FeatureFlagService in packages/backend/src/platform/feature-flag.service.ts.
3. Hook InventoryService: emit LowStockAlert outbox event when available stock <= 5 units.
4. Build worker consumer sending low-stock notification to store owner.
5. Expose admin feature flag toggle endpoints in PlatformAdminController.
6. Write unit and integration tests.

## Data / Database Changes

Creates feature_flags table in migration 0025-feature-flags.sql.

## Security Requirements

Feature flag modifications restricted strictly to platform administrators; audited in audit_logs.

## Error Handling

Feature flag evaluation defaults to disabled (false) if database is unreachable or key is missing.

## Edge Cases

- Variant already below threshold receives another purchase (throttles duplicate alerts to 1 per 24 hours)

## Observability

Tracks feature flag evaluation counts and active alert notifications.

## Tests Required

### Unit
- packages/backend/src/platform/feature-flag.service.test.ts (store allowlist evaluation, default off)

### Integration
- tests/integration/low-stock-alert.spec.ts (reserve stock dropping available to 3; verify LowStockAlert event emitted)

### End-to-End
- None.

### Security / Regression
- Assert non-admin cannot toggle feature flags

Do not mark the task complete until required tests pass.

## Manual Verification

Sell item down to 2 units; verify seller notification ledger records Low Stock warning.

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
Single review pass. Documented in docs/reviews/t076-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(platform): implement low-stock alert worker and administrative feature flags`

Only commit a meaningful green change.

## Completion Report

- **Files Changed**:
  - `db/migrations/0026-feature-flags.sql`: Schema migration for `feature_flags` table with store allowlists and rollout percentage.
  - `packages/backend/src/platform/schema.ts`: Drizzle schema definition.
  - `packages/backend/src/platform/feature-flag.service.ts`: Deterministic FNV-1a consistent hashing engine and feature flag service.
  - `packages/backend/src/platform/index.ts`: Exported `FeatureFlagService`, `computeRolloutBucket`, `featureFlagService`.
  - `packages/backend/src/inventory/inventory.service.ts`: Implemented `maybeEmitLowStockAlert` with 24-hour deduplication throttling.
  - `apps/worker/src/consumers/low-stock-alert.consumer.ts`: Low-stock event consumer dispatching to notification ledger.
  - `apps/worker/src/consumers/domain-events.consumer.ts`: Routed `inventory.low_stock_alert` to consumer.
  - `apps/api/src/feature-flags.controller.ts`: Platform admin endpoints with audit logging and public evaluation.
  - `apps/api/src/app.module.ts`: Registered `FeatureFlagsController`.
- **Migrations Created**: `db/migrations/0026-feature-flags.sql`
- **Tests Added**:
  - `packages/backend/src/platform/feature-flag.service.test.ts` (9 unit tests)
  - `apps/worker/src/consumers/low-stock-alert.consumer.test.ts` (4 unit tests)
  - `tests/integration/low-stock-alert.spec.ts` & `packages/backend/tests/integration/low-stock-alert.spec.ts` (4 integration tests)
  - `apps/api/src/feature-flags.controller.test.ts` (6 unit tests)
  - `apps/api/tests/integration/feature-flags.spec.ts` (3 HTTP integration tests)
- **Commands Executed**:
  - `pnpm --filter @shopscale/backend test:unit src/platform/feature-flag.service.test.ts` (9 passed)
  - `pnpm --filter @shopscale/worker test:unit src/consumers/low-stock-alert.consumer.test.ts` (4 passed)
  - `pnpm vitest run tests/integration/low-stock-alert.spec.ts` (4 passed)
  - `pnpm --filter @shopscale/api test:unit src/feature-flags.controller.test.ts` (6 passed)
  - `pnpm --filter @shopscale/api test:integration tests/integration/feature-flags.spec.ts` (3 passed)
  - `pnpm typecheck` (All 7 packages passed)
  - `pnpm --filter @shopscale/backend lint` (0 errors)
  - `pnpm --filter @shopscale/worker lint` (0 errors)
  - `pnpm --filter @shopscale/api lint` (0 errors)
  - `pnpm build` (All workspace projects passed)
- **Assumptions**: 24-hour rate limit on low-stock events per variant prevents event storms while guaranteeing store owners receive timely restock notices.
- **Review Status**: APPROVED (Risk Level: LOW, `docs/reviews/t076-context.md`).
- **Manual Verification Status**: Verified via live simulation and consumer idempotency checks.
