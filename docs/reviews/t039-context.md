# Review: TASK-039 — Implement Expiry and Stock Adjustments

## Scope & Implementation
- **Component**: Inventory Expiry Sweep Worker, Manual Stock Adjustment & Ledger Accounting
- **Files**:
  - `db/migrations/0011-inventory-status.sql`: Updated PostgreSQL CHECK constraints on `stock_reservations.status` (`'active'`, `'released'`, `'expired'`, `'consumed'`) and `stock_movements.reason` (`'initial_stock'`, `'manual_adjustment'`, `'reservation_created'`, `'reservation_released'`, `'reservation_expired'`, `'order_fulfillment'`, `'return_restock'`).
  - `packages/backend/src/inventory/inventory.service.ts`:
    - `releaseExpiredReservations(batchSize, customTx)`: Claims expired active reservations using `FOR UPDATE SKIP LOCKED`, decrements `inventory.reserved` using `GREATEST(0, reserved - qty)`, transitions reservation status to `'expired'`, and logs `stock_movements` with `delta_reserved = -qty` and reason `'reservation_expired'`.
    - `adjustStock(tx, input)`: Atomically updates `inventory.on_hand` with store scoping. Enforces the invariant that `on_hand` cannot be reduced below the active `reserved` count (`CANNOT_REDUCE_BELOW_RESERVED`), and writes `stock_movements` with `delta_on_hand = deltaOnHand`.
  - `apps/worker/src/schedulers/expiry.scheduler.ts`: Configures BullMQ repeatable job `inventory-expiry-sweep` running every 60 seconds with worker concurrency 1 and exponential backoff retry. Exposes `triggerNow()` for manual/CLI execution.
  - `apps/worker/src/main.ts`: Integrated and started `ExpiryScheduler` with graceful shutdown lifecycle.
  - `packages/backend/src/inventory/stock-adjustment.test.ts`: 5 unit tests covering restocking, negative stock guard, cannot reduce below reserved, store boundary isolation, and batch expiry sweep.
  - `apps/worker/src/schedulers/expiry.scheduler.test.ts`: Unit tests verifying BullMQ scheduler execution and delegation.
  - `packages/backend/tests/integration/inventory-expiry.spec.ts`: Integration tests verifying end-to-end database expiry sweep, stock recovery, movement ledger records, and cross-store boundary rejections.

---

## Independent Review: Expiry Race Locks & Ledger Accuracy
- **Inspector**: Technical Reviewer (Medium Risk)
- **Focus**: Concurrent lock safety, TOCTOU prevention, negative stock guards, and ledger idempotence.
- **Findings**:
  1. **Concurrency & SKIP LOCKED Expiry**:
     - `releaseExpiredReservations()` queries expired rows with `ORDER BY expires_at ASC, id ASC LIMIT $1 FOR UPDATE SKIP LOCKED`.
     - Multiple worker processes or concurrent cron runs will claim distinct disjoint sets of expired reservations without blocking each other or deadlocking.
     - Decrementing `inventory.reserved` uses `GREATEST(0, reserved - $1)` to guarantee reserved counters never drop below 0 even under race conditions.
  2. **Manual Adjustment Boundary & Invariant**:
     - `adjustStock()` evaluates `newOnHand < current.reserved` and throws typed `InventoryConstraintError` with code `CANNOT_REDUCE_BELOW_RESERVED`.
     - A seller cannot manually reduce inventory so far that it breaks active commitments to shoppers currently in checkout.
     - Store scoping `WHERE variant_id = $1 AND store_id = $2` prevents cross-tenant modification and returns `NOT_FOUND` uniformly without leaking variant existence.
  3. **Ledger Idempotency**:
     - Expiry sweep writes to `stock_movements` with `operation_key = 'expire:' + reservation.id` and `ON CONFLICT (operation_key, variant_id, reason) DO NOTHING`.
     - This guarantees that replayed jobs or duplicate worker runs will never double-decrement stock or pollute audit records.

---

## Verification Summary
- **Unit Tests**:
  - `packages/backend/src/inventory/stock-adjustment.test.ts`: 5 passing tests.
  - `apps/worker/src/schedulers/expiry.scheduler.test.ts`: 1 passing test.
  - Repository unit test total: 372 tests passing, 0 failures.
- **Integration Tests**:
  - `packages/backend/tests/integration/inventory-expiry.spec.ts`: 2 passing scenarios.
  - Full backend integration test suite: 21 test files passing.
- **Linting**: 0 errors, 0 warnings across workspace (`pnpm lint`).
- **Build**: Clean production build across all packages (`pnpm build`).
