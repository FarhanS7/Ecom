# Review: TASK-037 — Model Stock Invariants and Movement Ledger

## Scope & Implementation
- **Component**: Inventory Domain Modeling, Invariant Constraints & Movement Ledger
- **Files**:
  - `db/migrations/0010-inventory.sql`: Created `inventory`, `stock_reservations`, and `stock_movements` tables with strict PostgreSQL CHECK constraints and partial indexes.
  - `packages/backend/src/inventory/schema.ts`: Drizzle ORM table definitions, typed `InventoryConstraintError`, and `computeAvailableStock` invariant calculator.
  - `packages/backend/src/inventory/index.ts`: Re-exported inventory schema and ports.
  - `packages/backend/src/inventory/schema.test.ts`: Unit tests verifying availability calculation, Drizzle mappings, and error typing.
  - `packages/backend/tests/integration/inventory-schema.spec.ts`: Integration tests verifying database enforcement of `on_hand >= 0`, `reserved <= on_hand`, active reservation uniqueness, and movement ledger deduplication (`23505`).

## Invariant Verification

### 1. Non-Negative Stock Invariant
- PostgreSQL CHECK constraint `inventory_on_hand_non_negative`: `CHECK ("on_hand" >= 0)`.
- Verified: Attempting to insert or update `on_hand < 0` immediately raises `23514 check_violation`.

### 2. Reservation Ceiling Invariant
- PostgreSQL CHECK constraint `inventory_reserved_lte_on_hand`: `CHECK ("reserved" <= "on_hand")`.
- Verified: Attempting to insert or update `reserved > on_hand` immediately raises `23514 check_violation`.

### 3. Derived Available Stock
- Available stock is calculated dynamically: `on_hand - reserved`.
- Pure function `computeAvailableStock(onHand, reserved)` returns `Math.max(0, onHand - reserved)`.

### 4. Append-Only Movement Ledger
- `stock_movements` table records every physical or reserved delta with reason and operation key.
- Constraint `UNIQUE ("operation_key", "variant_id", "reason")` prevents double-posting of adjustments and fulfills idempotent movement deduplication.

### 5. Active Cart Reservation Constraint
- `stock_reservations` enforces `CHECK ("quantity" > 0)` and maintains a unique index on `(cart_id, variant_id)` for `status = 'active'`.

## Verification Status
- Unit tests: 100% pass (vitest)
- Integration tests: 100% pass (vitest)
- ESLint: 0 errors, 0 warnings
- TypeScript & Next.js: compiles cleanly
