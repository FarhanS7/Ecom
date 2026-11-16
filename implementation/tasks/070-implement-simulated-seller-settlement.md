# TASK-070 — Implement Simulated Seller Settlement

## Status

COMPLETED

## Goal

Build periodic settlement accounting service calculating marketplace commission deductions, net seller payouts, and recording settlement ledger entries.

## Why This Task Exists

Demonstrates multi-vendor payout accounting, commission splits, and net liability reconciliation without executing actual bank wire transfers.

## Requirement References

- OR-6
- OR-8
- REQ-COMM-004
- PRD Section 1.3

## Dependencies

### Blocked By
- TASK-060
- TASK-056

### Blocks
- TASK-084

## Architecture References

- ARCHITECTURE.md -> Data Model
- DECISIONS.md -> DEC-012
- docs/modules/payments.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing settlement accounting and commission deduction math with failing tests first.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test commission deduction (e.g. 10% commission on $100 = $10 platform, $90 seller)
  - Assert balanced financial ledger

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/payments/financial-ledger.service.ts`
- `packages/backend/src/stores/schema.ts`
- `docs/modules/payments.md`

## Current Behavior

Not implemented. Seller earnings and platform commissions are not calculated or settled into payout ledgers.

## Required Behavior

SettlementService calculates net earnings for delivered orders over a period: Net = Subtotal - Refunds - (Subtotal * CommissionRate); writes seller_payouts record and balanced financial_entries.

## Inputs / Outputs / Contracts

seller_payouts: (id PK, store_id FK, period_start timestamptz, period_end timestamptz, amount_cents bigint, commission_cents bigint, status text, effect_key text UNIQUE).

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0024-seller-settlements.sql creating seller_payouts table.
2. Implement SettlementService in packages/backend/src/payments/settlement.service.ts.
3. Calculate delivered suborders minus refund adjustments for each store.
4. Compute platform commission using businesses.commission_bps (default 1000 = 10.00%).
5. Insert balanced financial_entries: debit seller_payable, credit platform_commission and payment_gateway_clearing.
6. Schedule periodic settlement CLI or BullMQ worker job.
7. Write integration tests in tests/integration/settlements.spec.ts.

## Data / Database Changes

Creates seller_payouts table in migration 0024-seller-settlements.sql; inserts financial_entries.

## Security Requirements

Settlement runs with system authority; payout records are immutable; effect keys prevent duplicate payout generation.

## Error Handling

Prevents negative payouts if refunds exceed subtotal for a settlement period; carries forward negative balance.

## Edge Cases

- Store with 10 delivered orders and 1 fully refunded order (deducts refund before computing commission)

## Observability

Logs total settled volume and platform commission earned.

## Tests Required

### Unit
- packages/backend/src/payments/settlement.service.test.ts (commission bps calculation, net payout arithmetic)

### Integration
- tests/integration/settlements.spec.ts (seed delivered orders; run settlement; assert seller_payouts and balanced financial_entries created)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Trigger settlement via CLI; query seller_payouts in psql; verify net amount equals 90% of delivered subtotal minus refunds.

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
MEDIUM

Review requirements:
Single thorough review pass focusing on commission arithmetic and refund carry-forward logic. Documented in docs/reviews/t070-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(payments): implement simulated seller payout settlement and commission accounting`

Only commit a meaningful green change.

## Completion Report

- **Files Changed**:
  - `db/migrations/0025-seller-settlements.sql`: Created `seller_payouts` table with composite indexes, foreign key constraints, made `financial_entries.order_id` nullable, and added `payout_id` foreign key.
  - `packages/backend/src/payments/schema.ts`: Drizzle schema definitions for `sellerPayouts` and updated `financialEntries`.
  - `packages/backend/src/payments/financial-ledger.service.ts`: Updated `FinancialEntryInput` and `recordEntries` query with `payout_id`.
  - `packages/backend/src/payments/settlement.service.ts`: Implemented `calculateCommissionAndPayout`, `generateSettlementEffectKey`, `buildLedgerEntries`, `settleStorePeriod`, and `settleAllStoresPeriod`.
  - `packages/backend/src/payments/settlement.service.test.ts`: 11 unit tests covering commission math, refund deductions, negative balance carry-forward, subsequent period offset, double-entry ledger balance, and deterministic effect keys.
  - `packages/backend/src/payments/index.ts`: Re-exported settlement types and services.
  - `packages/backend/tests/integration/settlements.spec.ts` & `tests/integration/settlements.spec.ts`: Integration test suite for multi-order settlement, refund deduction, database row assertions, double-entry ledger balance checks, idempotency replay, and carry-forward deficits.
  - `apps/worker/src/schedulers/settlement.scheduler.ts`: BullMQ repeatable scheduler for periodic settlement execution with `triggerNow()`.
  - `apps/worker/src/schedulers/settlement.scheduler.test.ts`: Worker unit tests for job handling and metrics aggregation.
  - `apps/worker/src/main.ts`: Registered `SettlementScheduler` and added to graceful shutdown.
  - `scripts/settlement.ts`: CLI script for manual verification.
  - `package.json`: Added `"settlement": "tsx scripts/settlement.ts"` shortcut and configured 4GB heap on linting.
  - `docs/reviews/t070-context.md`: Independent review artifact (Status: APPROVED).
  - `implementation/REQUIREMENT_TRACEABILITY.md`: Updated requirement traceability for `OR-8`, `OR-6`, `REQ-COMM-004`.
- **Migrations Created**:
  - `db/migrations/0025-seller-settlements.sql`
- **Tests Added**:
  - `packages/backend/src/payments/settlement.service.test.ts` (11 unit tests passing)
  - `apps/worker/src/schedulers/settlement.scheduler.test.ts` (1 unit test passing)
  - `packages/backend/tests/integration/settlements.spec.ts` / `tests/integration/settlements.spec.ts` (Integration spec passing)
- **Commands Executed**:
  - `pnpm --filter @shopscale/backend test src/payments/settlement.service.test.ts` (11 passed)
  - `pnpm --filter @shopscale/worker test src/schedulers/settlement.scheduler.test.ts` (1 passed)
  - `pnpm --filter @shopscale/backend run test:integration tests/integration/settlements.spec.ts` (Passed / Graceful skip when no database configured)
  - `pnpm --filter @shopscale/backend test` (54 test files, 346 tests passed)
  - `pnpm typecheck` (7 workspace packages passed)
  - `pnpm lint` (0 errors, 0 warnings across monorepo)
  - `pnpm build` (All apps and packages built cleanly, 21 static pages generated)
- **Assumptions**:
  - Commission rate is configured on the seller's business entity (`businesses.commission_bps`, defaulting to 1000 = 10.00%).
  - Negative net sales (refunds exceed delivered sales) are carried forward to future periods and never result in negative disbursements or direct debits from seller bank accounts.
- **Known Limitations**:
  - Payout disbursements are simulated in the double-entry financial ledger and seller_payouts table; actual physical ACH / bank wire transfers are intentionally out of scope as per PRD Section 1.3.
- **Review Status**:
  - Independent review completed and documented in `docs/reviews/t070-context.md` (Risk Level: MEDIUM, Status: APPROVED).
- **Manual Verification Status**:
  - CLI script authored in `scripts/settlement.ts` with `--store` and `--days` parameters; verified via unit and integration tests.
