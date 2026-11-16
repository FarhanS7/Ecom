# Review Context: TASK-058 — Implement Cancellation and Return Requests

## Review Metadata
- **Task ID**: TASK-058
- **Risk Level**: MEDIUM (Financial & inventory state mutations)
- **Review Scope**: Order cancellation lifecycle, paid vs unpaid compensation, automatic inventory restocking, return requests submission, cumulative return quantity limits, transactional outbox events (`order.cancelled`, `order.refund_requested`, `return.requested`).
- **Reviewer**: Senior Technical Architect / Independent Reviewer
- **Outcome**: APPROVED

---

## 1. Executive Summary
TASK-058 delivers robust customer order cancellation and return request management adhering strictly to multi-vendor commerce invariants:
1. **Unpaid Order Cancellation**:
   - Customers can cancel unpaid orders (`payment_status = 'PENDING'`).
   - Order and suborder statuses transition to `CANCELLED`.
   - Releases held stock reservations.
   - Outbox event `order.cancelled` is recorded atomically.
2. **Paid Order Cancellation**:
   - Customers can cancel unshipped paid orders.
   - Order and suborders transition to `CANCELLED` with `payment_status = 'REFUNDED'`.
   - Automatically restocks inventory (`inventory.on_hand` incremented by line item quantity) and appends to `stock_movements` ledger with reason `ORDER_CANCELLED_RESTOCK`.
   - Outbox event `order.refund_requested` is recorded atomically with full order amount in integer cents for asynchronous payment gateway dispatch.
   - Shipped orders (`SHIPPED`, `PARTIALLY_SHIPPED`, `DELIVERED`, or any suborder marked `SHIPPED`) strictly reject cancellation with `AlreadyShippedError` (HTTP 400).
3. **Return Requests**:
   - Customers can initiate item-level return requests on `DELIVERED` orders (`POST /v1/orders/:id/returns`).
   - Persisted in `return_requests` table with initial status `PENDING_INSPECTION`, customer reason, and optional customer notes.
   - **Cumulative Return Quantity Cap**: Prevents over-returning across multiple return requests (`SUM(existing_return_requests.qty) + requested_qty <= order_items.qty`). Violations reject with `ReturnQuantityExceededError` (HTTP 409 Conflict).
   - Orders not yet delivered reject return creation with `OrderNotDeliveredError` (HTTP 400).
   - Outbox event `return.requested` emitted.
4. **Tenant & Customer Isolation**:
   - Foreign orders return `OrderNotFoundError` (HTTP 404) without leaking order existence.
   - All database updates and outbox events execute inside strict ACID transactions (`sql.begin`).

---

## 2. Invariant Verification

| Invariant | Status | Verification Evidence |
|---|---|---|
| **Unshipped Only Cancellation** | PASS | Shipped or partially shipped orders/suborders reject cancellation with `AlreadyShippedError`. Verified in `return.service.test.ts` and `returns.spec.ts`. |
| **Paid Order Restock & Refund** | PASS | Restocks `inventory.on_hand` and appends to `stock_movements`. Emits `order.refund_requested` to outbox. Verified in `returns.spec.ts`. |
| **Return Request On Delivered Only** | PASS | Non-delivered orders reject return creation with `OrderNotDeliveredError`. Verified in `return.service.test.ts` and `returns.spec.ts`. |
| **Cumulative Return Cap** | PASS | Sum of pending and approved returns cannot exceed purchased quantity. Rejects excess returns with `ReturnQuantityExceededError`. Verified in `return.service.test.ts` and `returns.spec.ts`. |
| **Customer Scoping (No Oracle)** | PASS | Mismatched user_id throws `OrderNotFoundError` (HTTP 404). Verified in unit and integration suites. |
| **Transactional Outbox Eventing** | PASS | Emits `order.cancelled`, `order.refund_requested`, `return.requested` inside transaction. |

---

## 3. Findings & Resolution
- **Cumulative Return Ledgering**: Return quantity checks query `return_requests` with status IN (`PENDING_INSPECTION`, `APPROVED`), ensuring rejected returns do not block future valid return requests while preventing double-returns of active requests.

---

## 4. Conclusion
TASK-058 passes all unit tests, integration tests, strict TypeScript compilation, and zero-warning ESLint checks. Ready for vendor inspection UI and refund processing.
