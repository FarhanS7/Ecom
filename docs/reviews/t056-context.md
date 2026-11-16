# Review Context: TASK-056 — Seller Fulfillment Transitions and Ledger

## Review Metadata
- **Task ID**: TASK-056
- **Risk Level**: MEDIUM
- **Review Scope**: Seller fulfillment FSM, tracking number enforcement, multi-vendor status derivation, audit event ledgering, outbox publishing.
- **Reviewer**: Senior Technical Architect / Independent Reviewer
- **Outcome**: APPROVED

---

## 1. Executive Summary
TASK-056 introduces independent vendor fulfillment lifecycle management for multi-seller orders. Sellers can transition suborders through strict sequential milestones (`PENDING -> PACKED -> SHIPPED -> DELIVERED`) while tracking numbers and carriers are durably captured upon dispatch. The implementation guarantees:
1. **Unpaid Order Protection**: FSM blocks fulfillment transitions if parent order `payment_status !== 'PAID'`, preventing vendor shipment of unconfirmed orders (`OrderNotPaidError`).
2. **Tenant Scoping & Multi-Store Isolation**: Sellers can only transition suborders matching their authorized `storeId`. Attempting to access or transition another vendor's suborder returns generic 404 (or `FulfillmentStoreMismatchError`), preventing oracle or cross-vendor interference.
3. **Strict Sequential FSM**: Jumps (e.g., `PENDING -> SHIPPED` or `PACKED -> DELIVERED`) and backwards transitions are rejected (`IllegalFulfillmentTransitionError`). Terminal statuses (`DELIVERED`, `CANCELLED`) cannot be modified.
4. **Mandatory Tracking Details**: Transition to `SHIPPED` strictly mandates a non-empty `trackingRef` (`MissingTrackingRefError`).
5. **Dynamic Parent Order Status Derivation**: Parent order fulfillment status reflects aggregate suborder statuses without coupling individual sellers:
   - All `CANCELLED` -> `CANCELLED`
   - All non-cancelled `DELIVERED` -> `DELIVERED`
   - All non-cancelled `SHIPPED` -> `SHIPPED`
   - Mixed `DELIVERED` and `SHIPPED` -> `PARTIALLY_DELIVERED`
   - At least 1 `SHIPPED` or `DELIVERED` with remaining `PENDING`/`PACKED` -> `PARTIALLY_SHIPPED`
   - At least 1 `PACKED` with remaining `PENDING` -> `PACKED`
   - All `PENDING` -> `PENDING`
6. **Immutable Audit Ledger & Domain Events**: Every transition writes an entry into `fulfillment_events` and commits an `order.suborder_transitioned` domain event into the transactional outbox within the same atomic ACID transaction.

---

## 2. Invariant Verification

| Invariant | Status | Verification Evidence |
|---|---|---|
| **Unpaid Order Fulfillment Blocked** | PASS | `validateFulfillmentTransition` checks `orderPaymentStatus === 'PAID'`. Tested in `fulfillment-fsm.test.ts` & `fulfillment.spec.ts`. |
| **Sequential Transition Enforcement** | PASS | Only `PENDING -> PACKED -> SHIPPED -> DELIVERED` allowed. Jumps and reversals throw `IllegalFulfillmentTransitionError`. |
| **Tracking Number Required on SHIPPED** | PASS | `toStatus === 'SHIPPED'` checks non-empty `trackingRef`. Tested in unit and integration suites. |
| **Parent Status Aggregation** | PASS | Evaluated against all sibling suborders; updates `orders.fulfillment_status` (`PARTIALLY_SHIPPED`, `SHIPPED`, etc.). |
| **Tenant Isolation** | PASS | Gated via `authorizeStore(req, storeId, 'fulfillment:manage')` and row-level check `suborder.store_id === storeId`. |
| **Atomic Ledgering & Outbox** | PASS | `seller_orders` update, `fulfillment_events` insert, `orders` update, and `outbox_events` insert execute inside a single `sql.begin(async (tx) => ...)`. |

---

## 3. Findings & Resolution
- **Finding 1**: Database constraint on `orders.fulfillment_status` originally allowed only 5 values (`PENDING`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED`), preventing `PARTIALLY_SHIPPED`.
  - *Resolution*: Added migration `db/migrations/0017-fulfillment.sql` updating `orders_fulfillment_status_check` to include `PARTIALLY_SHIPPED` and `PARTIALLY_DELIVERED`, and updated `packages/backend/src/commerce/schema.ts` and `schema.test.ts`.
- **Finding 2**: Tracking number and carrier columns were missing on `seller_orders`.
  - *Resolution*: Added `tracking_ref`, `carrier`, `shipped_at`, and `delivered_at` columns in migration `0017-fulfillment.sql`.

---

## 4. Conclusion
TASK-056 satisfies all functional, architectural, and security invariants. Ready for production and UI fulfillment dashboard integration.
