# Independent Review: TASK-042 — Implement Guest Cart Ownership and Merge

## Review Overview
- **Task**: TASK-042 (Implement Guest Cart Ownership and Merge)
- **Risk Level**: MEDIUM
- **Focus**: HMAC-SHA256 guest token signing, constant-time verification, replay prevention (UNIQUE guest_cart_id), atomic quantity summation with 99 ceiling, and cache invalidation.
- **Review Date**: 2026-11-16
- **Status**: APPROVED

---

## Pass 1: Security & Idempotency Architecture Review

### 1. HMAC-SHA256 Signing and Timing-Safe Verification
- **Implementation**: `GuestTokenService` in `packages/backend/src/cart/guest-token.service.ts`.
- **Token Structure**: `<guestId>.<hexSignature>` where `hexSignature = HMAC-SHA256(secret, guestId)`.
- **Timing Attack Mitigation**:
  - Verification uses `crypto.timingSafeEqual(expectedBuf, providedBuf)` after verifying length equality.
  - Prevents side-channel timing attacks that could reveal signature bytes.
- **Tamper Detection**:
  - Forged guest IDs or altered signature bytes fail verification.
  - In `CartController`, tampered guest tokens throw `TamperedTokenError`, mapped to HTTP 401 Unauthorized (`UnauthorizedException`).

### 2. Idempotency & Replay Protection
- **Database Boundary**:
  - Table `cart_merges` (`db/migrations/0013-cart-merges.sql`) enforces `CONSTRAINT "cart_merges_guest_cart_id_key" UNIQUE ("guest_cart_id")`.
  - Attempts to merge an already-merged guest cart throw `CartAlreadyMergedError`, mapped to HTTP 409 Conflict with `{ error: 'CART_ALREADY_MERGED' }`.
- **Single Unit-of-Work**:
  - The merge operation executes inside a single PostgreSQL transaction `sql.begin(async (tx) => { ... })`.
  - Transaction steps:
    1. Inserts into `cart_merges` (failing fast on replay).
    2. Retrieves or creates customer cart for `channelKey`.
    3. Reads all items from `cart_items` for the guest cart.
    4. For each item: updates existing user item with `Math.min(99, userQty + guestQty)` or inserts new item with `Math.min(99, guestQty)`.
    5. Deletes all items from guest cart (`DELETE FROM cart_items WHERE cart_id = guestCart.id`).
    6. Updates audit row `cart_merges` with `items_merged_count` and `user_cart_id`.
    7. Increments `carts.version` on customer cart.
    8. Loads fresh `CartDto` within transaction.

### 3. Redis Invalidation & Snapshot Synchronization
- **Dual-Write Ordering**:
  - PostgreSQL transaction commits first.
  - Guest cart Redis key `cart:${channelKey}:${guestId}` is invalidated via `cache.invalidate()`.
  - User cart Redis key `cart:${channelKey}:${userId}` is refreshed with the consolidated `CartDto` and 30-day TTL.
- **Cookie Lifecycle**:
  - Upon successful merge in `CartController`, `res.header('Set-Cookie', 'cart_guest_token=; Path=/; Max-Age=0; HttpOnly')` immediately clears the guest cookie on the client.

### 4. Edge Cases Tested
- **Quantity Summing**: Customer with 5 units + Guest with 10 units = 15 units.
- **Quantity Ceiling**: Customer with 60 units + Guest with 50 units = 99 units (capped).
- **Authentication Gate**: Unauthenticated calls to `POST /v1/carts/:channelKey/merge` are rejected with 401 Unauthorized.
- **Login Hook**: `apps/api/src/auth.controller.ts` detects `cart_guest_token` on login, triggers merge into customer's marketplace cart, and safely clears the guest cookie.

---

## Verification Evidence
- **Contracts**: `mergeCartRequestSchema` and `mergeCartResponseSchema` in `packages/contracts/src/cart.ts`.
- **Database Migration**: `db/migrations/0013-cart-merges.sql`.
- **Schema**: `cartMerges` table in `packages/backend/src/cart/schema.ts`.
- **Unit Tests**: 8 tests in `packages/backend/src/cart/guest-merge.test.ts` (100% pass).
- **API Tests**: 16 tests in `apps/api/src/cart.controller.test.ts` (100% pass).
- **Integration Tests**: 3 scenarios in `packages/backend/tests/integration/cart-merge.spec.ts` (100% pass).
- **Full Workspace Build & Lint**: `pnpm build` clean; `pnpm lint` 0 errors, 0 warnings; 418 unit and integration tests passing across all packages.

---

## Verdict
APPROVED. All security requirements, HMAC invariants, replay prevention, and consolidation constraints are fully satisfied.
