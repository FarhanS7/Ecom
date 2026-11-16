# Independent Review: TASK-041 — Implement Durable Channel Carts

## Review Overview
- **Task**: TASK-041 (Implement Durable Channel Carts)
- **Risk Level**: MEDIUM
- **Focus**: Dual-write consistency between Redis and PostgreSQL, channel isolation, cache recovery, quantity bounding, and cross-store rejection.
- **Review Date**: 2026-11-16
- **Status**: APPROVED

---

## Pass 1: Dual-Write Consistency & Architecture Review

### 1. PostgreSQL Persistence and Concurrency Semantics
- **Tables and Constraints**:
  - `db/migrations/0012-carts.sql` introduces `carts` and `cart_items` tables with explicit database-level constraints.
  - Ownership: `CONSTRAINT carts_owner_check CHECK ((user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL))` ensures strictly one owner kind per cart.
  - Channel Key Rule: `CONSTRAINT carts_channel_check CHECK ((channel_key = 'marketplace' AND store_id IS NULL) OR (store_id IS NOT NULL AND channel_key = store_id::text))` guarantees channel integrity.
  - Partial Unique Indexes:
    - `carts_channel_user_uniq ON carts (channel_key, user_id) WHERE user_id IS NOT NULL`
    - `carts_channel_guest_uniq ON carts (channel_key, guest_id) WHERE guest_id IS NOT NULL`
    - `cart_items_cart_variant_uniq UNIQUE (cart_id, variant_id)` prevents duplicate variant line items.
- **Transactional Sequence**:
  - In `CartService.addItem`, `updateItem`, `removeItem`, and `clearCart`, all database mutations (`INSERT`/`UPDATE`/`DELETE` on `cart_items` and optimistic version increment `UPDATE carts SET version = version + 1`) run inside a single `sql.begin(async (tx) => { ... })` transaction.
  - The transaction loads the fresh `CartDto` directly within the unit of work before commit, guaranteeing that read-after-write reflects the committed state.

### 2. Redis Snapshot Sync & Recovery
- **Cache Key Design**:
  - `cart:${channelKey}:${ownerId}` where `ownerId` is either `userId` (for logged-in customers) or `guestId` (for anonymous visitors).
  - Stored with 30-day TTL (`2,592,000` seconds).
- **Dual-Write Ordering**:
  - Database commit **strictly precedes** Redis cache write.
  - If Redis is unavailable or throws, `RedisCacheService` degrades gracefully without failing the business operation.
- **Cache Flush Recovery**:
  - Verified in `packages/backend/tests/integration/cart.spec.ts`: when `redisStore.clear()` simulates a Redis restart or eviction, `CartService.getCart()` detects the cache miss, queries PostgreSQL, joins live catalog prices and inventory stock, reconstructs `CartDto`, and repopulates the Redis snapshot.

### 3. Dynamic Catalog Pricing & Availability
- Carts dynamically calculate live prices:
  - Query joins `product_variants` and `products` at read time (`pv.price_cents`), computing `totalCents` from current active variant prices rather than stale prices at addition time.
  - Computes `available` dynamically by checking variant status, product status, and inventory stock availability `(on_hand - reserved) >= quantity`.

### 4. Boundary Enforcement & Security
- **Store Mismatch Protection**:
  - When `channelKey !== 'marketplace'`, the variant's `store_id` is validated against the channel's `storeId`.
  - Adding a product variant from another store throws `StoreMismatchError` which maps to HTTP 400 Bad Request with `{ error: 'STORE_MISMATCH' }`.
- **Customer Cart Isolation**:
  - Ownership is derived strictly from the verified session actor (`req.actor.userId`) or the guest token (`x-guest-id` / cookie `cart_guest_token`). Callers cannot supply arbitrary user IDs to access foreign carts.
- **Quantity Constraints**:
  - Quantity bounded to `1..99` on add and `0..99` on update. Summing duplicate line items past 99 throws `CartValidationError` with `MAX_QUANTITY_EXCEEDED` (HTTP 400).

---

## Verification Evidence
- **Contracts**: `packages/contracts/src/cart.ts` exported via `packages/contracts/src/index.ts`.
- **Schema & Migrations**: `db/migrations/0012-carts.sql` and `packages/backend/src/cart/schema.ts`.
- **Service**: `packages/backend/src/cart/cart.service.ts` (13/13 unit tests pass in `cart.service.test.ts`).
- **Controller**: `apps/api/src/cart.controller.ts` (12/12 unit tests pass in `cart.controller.test.ts`).
- **Integration**: `packages/backend/tests/integration/cart.spec.ts` (3/3 integration scenarios pass).
- **Full Suite**: All 406 tests pass across workspace projects (`pnpm test`).
- **Linter & Types**: `pnpm lint` passed with 0 errors/warnings; `pnpm build` completed with 0 errors.

---

## Verdict
APPROVED. All requirements, architecture invariants, dual-write consistency rules, and security boundaries are satisfied.
