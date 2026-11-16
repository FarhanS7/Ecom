# Review: TASK-038 — Implement Atomic Basket Reservations

## Scope & Implementation
- **Component**: Inventory Reservation Engine, Deadlock-Free Locking & Movement Ledger
- **Files**:
  - `packages/backend/src/inventory/inventory.service.ts`: `InventoryService` with `reserve()` implementation:
    - Deadlock-free lock acquisition order via `aggregateAndSortItems()` (`variantId ASC`).
    - Conditional atomic SQL update: `UPDATE inventory SET reserved = reserved + $1, version = version + 1 WHERE variant_id = $2 AND (on_hand - reserved) >= $1 RETURNING store_id, on_hand, reserved`.
    - Savepoint-guarded rollback: if any line item in a multi-item basket fails, the savepoint rolls back partial reservations and queries available stock for typed error response.
    - Active reservation insertion with 15-minute default TTL.
    - Append-only `stock_movements` ledger insertion (`reason = 'reservation_created'`).
  - `packages/backend/src/inventory/index.ts`: Re-exported `InventoryService`, `inventoryService`, and types.
  - `packages/backend/src/inventory/inventory.service.test.ts`: 8 unit tests covering input sorting, payload quantity aggregation, validation, typed result mapping, savepoint rollbacks, and missing variant handling.
  - `packages/backend/tests/integration/inventory-reserve.spec.ts`: Integration tests covering multi-item atomic reservations, rollback of earlier items when the 3rd item fails (0 partial reservations survive), and deadlock avoidance under reverse-order concurrent reservation calls.

---

## Independent Review — Pass 1: Lock Ordering and Deadlock Avoidance
- **Inspector**: Technical Reviewer (Pass 1)
- **Focus**: Lock ordering, duplicate aggregation, and concurrent interleaving.
- **Findings**:
  1. **Deterministic Lock Ordering**:
     - `aggregateAndSortItems()` performs a strict lexicographical ascending sort on `variantId` (`a.variantId.localeCompare(b.variantId)`).
     - Because every concurrent transaction acquires row locks on `inventory` in strictly ascending order, circular lock-wait graphs (dining philosophers) are mathematically impossible.
  2. **Duplicate Variant Handling**:
     - Checkouts containing duplicate variant line items (e.g., added from different sections or bundle expansions) are aggregated into a single entry with combined quantity before sorting and locking.
     - This guarantees each variant is locked and updated exactly once per checkout transaction, avoiding self-deadlocks and unique constraint collisions on `stock_reservations (cart_id, variant_id) WHERE status = 'active'`.
  3. **Verification**:
     - Verified by integration test `avoids deadlocks under reverse-order concurrent reservation calls`: two concurrent transactions requesting `[low, high]` and `[high, low]` execute concurrently without encountering PostgreSQL error `40P01` (`deadlock_detected`).

---

## Independent Review — Pass 2: Conditional Update and Atomic Rollback Logic
- **Inspector**: Systems Architect (Pass 2)
- **Focus**: Database invariants, race conditions, oversell prevention, and atomicity.
- **Findings**:
  1. **Zero-Oversell Guarantee**:
     - The reservation relies on single-row atomic conditional updates:
       `WHERE "variant_id" = $2 AND ("on_hand" - "reserved") >= $1`
     - Evaluated at PostgreSQL engine level under row-level exclusive lock. TOCTOU application-level races are eliminated.
     - Backed by the database CHECK constraint `CHECK ("reserved" <= "on_hand")` as defense-in-depth.
  2. **All-or-Nothing Atomicity via Savepoints**:
     - Multi-item checkout must never leave partial inventory reserved if one item in the basket is out of stock.
     - A dynamic savepoint `sp_reserve_*` is opened at the start of the reservation.
     - If any item yields 0 updated rows, the transaction executes `ROLLBACK TO SAVEPOINT`, reverting changes to earlier items in the basket without aborting the outer database transaction.
     - Follow-up query retrieves current available stock to construct the typed `{ ok: false, code: 'INSUFFICIENT_STOCK', variantId, available }` error payload.
  3. **Audit Movement Ledger**:
     - Every successful reservation appends a ledger row to `stock_movements` with `delta_reserved = +qty`, `reason = 'reservation_created'`, and `operation_key = 'reserve:' + checkoutId`.
     - Idempotent deduplication is guaranteed by the unique index `(operation_key, variant_id, reason)`.

---

## Verification Summary
- **Unit Tests**: 8 passing tests in `inventory.service.test.ts`. Full suite: 160 passing tests in `@shopscale/backend`.
- **Integration Tests**: 3 integration scenarios verified in `inventory-reserve.spec.ts`.
- **Linting**: 0 errors, 0 warnings across the entire repository.
- **Typecheck & Build**: Clean production build across all workspace packages (`@shopscale/backend`, `@shopscale/contracts`, `@shopscale/config`, Next.js `apps/web`, `apps/api`, `apps/worker`).
