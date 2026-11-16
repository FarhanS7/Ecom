# Independent Review: TASK-070 — Implement Simulated Seller Settlement

## Review Metadata
- **Task ID**: `TASK-070`
- **Goal**: Implement periodic simulated seller settlement accounting service calculating marketplace commission deductions, net seller payouts, and recording balanced double-entry financial ledger entries.
- **Risk Level**: MEDIUM
- **Requirements Covered**: `OR-6`, `OR-8`, `REQ-COMM-004`, PRD Section 1.3, DEC-012
- **Date**: 2026-11-17
- **Status**: APPROVED

---

## 1. Scope & Architecture Inspected

### Database Migration
- `db/migrations/0025-seller-settlements.sql`:
  - Created `seller_payouts` table:
    - Primary key: `id` (uuid, default `gen_random_uuid()`).
    - Foreign key: `store_id` referencing `stores.id` with `ON DELETE RESTRICT`.
    - Columns: `period_start`, `period_end`, `gross_sales_cents`, `refund_deductions_cents`, `net_sales_cents`, `commission_bps`, `commission_cents`, `amount_cents`, `carried_forward_cents`, `status`, `effect_key`, `created_at`, `updated_at`.
    - Status check constraint: `IN ('PENDING', 'COMPLETED', 'CARRIED_FORWARD', 'FAILED')`.
    - Unique constraint: `effect_key` for idempotent settlement execution.
    - Composite indexes: `("store_id", "created_at" DESC)` and `("store_id", "period_start", "period_end")`.
  - Altered `financial_entries`:
    - Made `order_id` nullable (`DROP NOT NULL`) to accommodate batch settlement payout operations.
    - Added `payout_id` uuid column referencing `seller_payouts.id` with `ON DELETE RESTRICT`.
    - Added partial index on `financial_entries.payout_id WHERE payout_id IS NOT NULL`.

### Drizzle Schema & Core Services
- `packages/backend/src/payments/schema.ts`:
  - Added `sellerPayouts` Drizzle table definition and `SellerPayoutRow`, `NewSellerPayoutRow`, `SellerPayoutStatus` types.
  - Updated `financialEntries` table schema with `payoutId` and nullable `orderId`.
- `packages/backend/src/payments/financial-ledger.service.ts`:
  - Updated `FinancialEntryInput` interface with `payoutId?: string | null | undefined;` and optional `orderId?: string | null | undefined;`.
  - Updated `recordEntries` SQL insert statement to include `payout_id`.
- `packages/backend/src/payments/settlement.service.ts`:
  - `calculateCommissionAndPayout(input: CalculationInput)`: Pure function implementing integer arithmetic for:
    - `totalDeductions = refundCents + priorCarriedForwardCents`
    - `netSalesCents = grossSalesCents - totalDeductions`
    - If `netSalesCents <= 0`: `amountCents = 0`, `commissionCents = 0`, `carriedForwardCents = Math.abs(netSalesCents)`, `status = 'CARRIED_FORWARD'`.
    - If `netSalesCents > 0`: `commissionCents = Math.round((netSalesCents * commissionBps) / 10000)`, `amountCents = netSalesCents - commissionCents`, `carriedForwardCents = 0`, `status = 'COMPLETED'`.
  - `generateSettlementEffectKey(storeId, periodStart, periodEnd)`: Produces deterministic unique key `settlement:${storeId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`.
  - `SettlementService.buildLedgerEntries(input)`: Generates balanced double-entry entries:
    - Debit `seller_payable` = `netSalesCents`
    - Credit `platform_commission` = `commissionCents`
    - Credit `payment_gateway_clearing` = `amountCents`
    - Verifies zero-sum balance: $\sum \text{debits} \equiv \sum \text{credits}$.
  - `settleStorePeriod(input)`: Executes settlement inside PostgreSQL transaction:
    - Enforces idempotency via `seller_payouts.effect_key`.
    - Aggregates delivered orders from `seller_orders` (`fulfillment_status = 'DELIVERED'`).
    - Aggregates completed refunds for store's order items.
    - Queries and offsets prior `carried_forward_cents`.
    - Atomically writes `seller_payouts` and balanced `financial_entries`.
  - `settleAllStoresPeriod(input)`: Processes all active stores for a given settlement window.

### Background Scheduling & Automation
- `apps/worker/src/schedulers/settlement.scheduler.ts`:
  - BullMQ repeatable queue job `'settle-sellers'` running on a periodic schedule (default: 24h / 86,400,000ms).
  - Provides `triggerNow(periodStart?, periodEnd?)` method for test and manual triggering.
  - Logs aggregated metrics: stores settled, gross sales, platform commissions, disbursements, and execution duration.
- `apps/worker/src/main.ts`:
  - Registered `SettlementScheduler` alongside `ReportingScheduler` and `ReconciliationScheduler`.
  - Integrated with graceful shutdown handlers (`SIGTERM`, `SIGINT`).
- `scripts/settlement.ts`:
  - Dedicated CLI tool for triggering single-store (`--store=<id>`) or platform-wide settlements (`--days=<n>`).
  - Added shortcut `"settlement": "tsx scripts/settlement.ts"` in root `package.json`.

---

## 2. Verification of Invariants & Settlement Arithmetic

### Arithmetic Proof: Normal Commission Settlement
- **Scenario**: Gross delivered sales $1,000.00 (100,000 cents), Completed refunds $100.00 (10,000 cents), Commission 1000 bps (10.00%).
- **Calculation**:
  - `netSalesCents = 100,000 - 10,000 = 90,000` ($900.00).
  - `commissionCents = round(90,000 * 1000 / 10000) = 9,000` ($90.00).
  - `amountCents = 90,000 - 9,000 = 81,000` ($810.00).
  - `carriedForwardCents = 0`.
- **Double-Entry Ledger Invariant**:
  - Debit `seller_payable`: 90,000 cents
  - Credit `platform_commission`: 9,000 cents
  - Credit `payment_gateway_clearing`: 81,000 cents
  - Total Debits = 90,000; Total Credits = 9,000 + 81,000 = 90,000. Balanced!

### Deficit Handling & Carry-Forward Proof
- **Scenario**: Gross sales $200.00 (20,000 cents), Completed refunds $500.00 (50,000 cents).
- **Calculation**:
  - `netSalesCents = 20,000 - 50,000 = -30,000` (-$300.00).
  - `amountCents = 0` (negative disbursements strictly prohibited).
  - `commissionCents = 0`.
  - `carriedForwardCents = 30,000` ($300.00).
  - `status = 'CARRIED_FORWARD'`.
  - No `financial_entries` created since 0 funds are disbursed.
- **Subsequent Period Offset**:
  - Subsequent period gross sales $1,000.00 (100,000 cents), refunds $0.00.
  - Deductions = 0 + 30,000 (carried forward) = 30,000 cents.
  - `netSalesCents = 100,000 - 30,000 = 70,000` ($700.00).
  - Commission (10%) = 7,000 cents ($70.00).
  - Net payout = 63,000 cents ($630.00).
  - `carriedForwardCents = 0`. Status = `COMPLETED`.

### Idempotency Proof
- Unique index on `seller_payouts.effect_key`.
- Replaying the same settlement period returns the existing payout record with `isExisting: true` without inserting duplicate rows or financial entries.

---

## 3. Test Results & Quality Gates

1. **Unit Tests**:
   - `packages/backend/src/payments/settlement.service.test.ts`:
     - 11 unit tests covering standard commission split, refund deduction, custom bps, fractional rounding, deficit carry-forward, subsequent period offset, zero activity, double-entry ledger balance, carried-forward ledger suppression, and deterministic key generation.
     - **Status**: PASSED (11/11).
   - `apps/worker/src/schedulers/settlement.scheduler.test.ts`:
     - Unit test verifying BullMQ job triggering, metrics aggregation, and service delegation.
     - **Status**: PASSED (1/1).
2. **Integration Tests**:
   - `packages/backend/tests/integration/settlements.spec.ts` & `tests/integration/settlements.spec.ts`:
     - Comprehensive integration test suite verifying multi-order gross sales aggregation, refund deductions, database row assertions, double-entry ledger balance query checks, idempotency replay, and multi-period carry-forward offset.
     - **Status**: PASSED.
3. **Repository-Wide Test Suite**:
   - `pnpm --filter @shopscale/backend test`:
     - 54 test files, 346 tests passed. 0 failures.
4. **Typecheck Gate**:
   - `pnpm typecheck`: Clean across all 7 workspace packages (`apps/web`, `apps/api`, `apps/worker`, `apps/mock-payments`, `packages/backend`, `packages/contracts`, `packages/config`).
5. **Lint Gate**:
   - `pnpm lint`: Clean across the entire monorepo. 0 errors, 0 warnings.
6. **Build Gate**:
   - `pnpm build`: Clean production build across all workspace projects. Next.js prerendered 21 static pages.

---

## 4. Findings & Risk Assessment

- **Risk Level**: MEDIUM.
- **Review Finding**: Zero-sum double-entry ledgering and integer cents arithmetic guarantee that no money is created or lost. Negative payouts are safely rejected and converted into carried forward balances.
- **Decision**: APPROVED. TASK-070 is ready to be marked COMPLETED.
