# Independent Review: TASK-047 Implement Idempotent Checkout Creation

## Overview
- **Task ID**: `TASK-047`
- **Scope**: Atomic checkout coordinator (`CheckoutService`) enforcing mandatory `Idempotency-Key` headers, SHA-256 request payload hashing, cryptographic quote token verification, atomic inventory reservation across vendors, immediate seller suborders splitting (DEC-011), historical address and item snapshotting, and transactional outbox event publishing (`order.checkout_reserved`) in a single ACID database transaction.
- **Reviewer**: Technical Lead & Security / Data Architecture Review (Two-Pass Review)
- **Risk Level**: HIGH
- **Status**: PASSED

---

## 1. Review Pass 1: ACID Transaction Boundaries & Atomic Rollback (G2, G3)

### Transaction Composition
The entire checkout operation inside `CheckoutService.initiateCheckout` executes inside a single PostgreSQL transaction (`sql.begin`):
1. **Idempotency Record Lock**:
   - Inserts `idempotency_requests` row with `status = 'PROCESSING'` and `request_hash = SHA256(...)`.
   - Any concurrent request with the same `(user_id, operation, channel_key, key)` immediately aborts on the unique constraint or in-flight processing status.
2. **Atomic Inventory Reservation**:
   - Calls `inventoryService.reserve(tx, { checkoutId: orderId, items })`.
   - Lexicographical sort on `variant_id` prevents deadlocks.
   - Conditional atomic row updates (`"on_hand" - "reserved" >= $1`) guarantee 0 overselling.
   - If stock is insufficient on any item, throws `InsufficientStockError`, aborting the transaction before any partial state leaks.
3. **Parent Order Insertion**:
   - `orders` row inserted with `payment_status = 'PENDING'` and `fulfillment_status = 'PENDING'`.
   - Captures immutable JSONB snapshot of customer shipping address.
4. **Immediate Vendor Suborder Partitioning (DEC-011)**:
   - For each distinct vendor in the basket, a child `seller_orders` record is created atomically.
   - Each suborder carries its independent vendor subtotal, shipping ($5.00/seller), allocated coupon discount, and commission rate snapshot (1000 bps).
5. **Historical Line Item Snapshots**:
   - `order_items` inserts enforce composite FK `(store_id, seller_order_id)`.
   - Variant title, SKU, unit price, quantity, and line discount are permanently snapshot.
6. **Transactional Outbox Publishing**:
   - `writeOutboxEvent(tx, { type: 'order.checkout_reserved', ... })` commits simultaneously with domain entities.
   - Prevents phantom events or lost event writes upon crash.
7. **Idempotency Finalization**:
   - Updates `idempotency_requests` to `status = 'COMPLETED'`, `response_status = 201`, and stores the full response JSONB.

### Verification of Rollback
- Tested in `packages/backend/tests/integration/checkout.spec.ts`:
  When item 2 of 2 has 0 available units, `InsufficientStockError` is thrown.
  - Zero `orders` rows created.
  - Zero `seller_orders` rows created.
  - Zero `order_items` rows created.
  - Zero partial stock reservations retained for item 1.
  - Zero outbox records created.

---

## 2. Review Pass 2: Idempotency Semantics, Hashing & Replay Safety (OR-1, G3)

### Hash Calculation
The request payload hash is calculated deterministically:
```ts
hashRequest(channelKey, addressId, acceptedQuoteToken) = SHA256(JSON.stringify({ channelKey, addressId, acceptedQuoteToken }))
```

### Invariant Checks
1. **Identical Replay**:
   - A client retrying after network timeout with the same `Idempotency-Key` and matching parameters matches the completed record and receives the original 201 response directly from `response_body`.
   - No duplicate orders are placed, no extra inventory is reserved.
2. **Key Reuse with Modified Payload**:
   - If an attacker or buggy client reuses an `Idempotency-Key` with a different `addressId` or `acceptedQuoteToken`, the hash does not match.
   - Throws `IdempotencyConflictError`, translated to HTTP 409 Conflict.
3. **In-Flight Processing Protection**:
   - A second request arriving while the first is actively executing in `PROCESSING` state is rejected with 409 Conflict, preventing double execution races.
4. **Quote Token Verification**:
   - Tokens signed by server secret; verified with `crypto.timingSafeEqual`. Expired tokens (> 15 minutes) or tampered tokens throw `InvalidQuoteTokenError` (401 Unauthorized).

---

## 3. Test Verification Summary

| Test Suite | Tests | Result |
|---|---|---|
| `packages/backend/src/commerce/checkout.service.test.ts` | 9 | PASSED |
| `apps/api/src/commerce.controller.test.ts` | 11 | PASSED |
| `packages/backend/tests/integration/checkout.spec.ts` | 3 | PASSED |
| `apps/web/src/lib/api.test.ts` | 5 | PASSED |
| `apps/api/tests/integration/permission-matrix.spec.ts` | 7 | PASSED |
| Full Workspace Unit Suite (`pnpm test`) | 484 | PASSED |
| Full Repository Lint (`pnpm lint`) | 0 warnings, 0 errors | PASSED |
| Full Repository Build (`pnpm build`) | All 6 packages | PASSED |

---

## 4. Review Findings & Resolution
- **Finding 1 (Fixed)**: In `packages/backend/src/commerce/checkout.service.ts`, untyped JSONB field casts triggered `@typescript-eslint/no-base-to-string`. Defined `StoredAddressFields` interface with typed string properties, eliminating all stringification risks.
- **Finding 2 (Fixed)**: Replaced loose `any` casts in tests with typed `MockSql` and `Actor` fixtures to satisfy strict ESLint rules.
- **Finding 3 (Fixed)**: Updated `docs/openapi.json` and `packages/backend/src/platform/route-policy.ts` to include `POST /v1/checkout`, ensuring CI route policy completeness check remains 100% green.
