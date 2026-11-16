# Review Context: TASK-053 (Prove the Checkout Expiry Race)

## Review Metadata
- **Task ID**: `TASK-053`
- **Feature**: Checkout Expiry Race Condition & Automated Compensation Proof
- **Risk Level**: HIGH
- **Status**: APPROVED
- **Review Date**: 2026-11-16
- **Reviewer**: Principal Concurrency Architect & Financial Auditing Specialist

---

## 1. Scope & Execution Proof Summary
Proved the most critical distributed e-commerce race condition: late payment webhook arrival after reservation expiration where physical inventory has already been sold to a competitor.

### Step-by-Step Race Execution (`tests/integration/checkout-expiry-race.spec.ts`)
1. **Initial Condition**:
   - Warehouse has exactly 1 physical unit in stock (`on_hand = 1, reserved = 0`).
2. **Customer 1 Checkout Lock**:
   - Customer 1 initiates checkout; creates Order 1; reserves the single unit.
   - Counters: `on_hand = 1, reserved = 1, available = 0`.
3. **Reservation Expiration**:
   - Customer 1 is delayed / leaves browser.
   - Reservation expires via `inventoryService.releaseExpiredReservations`.
   - Reservation status transitions to `'expired'`.
   - Stock counters restored: `on_hand = 1, reserved = 0, available = 1`.
4. **Competitor Purchase (Customer 2)**:
   - Customer 2 reserves the restored unit and pays immediately.
   - Settle flow confirms Customer 2's order (`payment_status = 'PAID'`).
   - Stock counters decremented to zero: `on_hand = 0, reserved = 0, available = 0`.
   - The warehouse is completely sold out.
5. **Delayed Webhook Arrival for Customer 1**:
   - Customer 1's gateway finally delivers `payment.succeeded` for Order 1.
   - `OrderCompletionService.handlePaymentObserved` invokes `confirmReservation(tx, order1Id)`.
   - `confirmReservation` returns `confirmedCount: 0` because no active reservation exists for Order 1.
   - System queries `stock_reservations` and detects reservation status `'expired'`.
6. **Automated Compensation Verdict**:
   - **Order 1 Status**: Updated to `payment_status = 'REFUNDED'`, `fulfillment_status = 'CANCELLED'`.
   - **Seller Order 1 Status**: Updated to `fulfillment_status = 'CANCELLED'`.
   - **Outbox Event**: Emits `order.refund_requested` domain event carrying `{ orderId, amountCents, reason: 'RESERVATION_EXPIRED', effectKey }`.
   - **Physical Inventory**: `on_hand` remains exactly `0` (ZERO negative stock, ZERO overselling).
   - **Customer 2 Integrity**: Customer 2's Order 2 remains valid and confirmed (`PAID`).

---

## 2. Invariant Checklist
- [x] Zero overselling: `on_hand` never drops below 0 when late payment arrives.
- [x] Automated compensation: customer whose reservation expired is automatically scheduled for refund via outbox domain event.
- [x] Seller suborders partitioned and marked `CANCELLED` so sellers never pack expired orders.
- [x] Competitor's confirmed purchase is protected from invalid rollback.

---

## 3. Test Coverage Summary
- `packages/backend/src/commerce/order-completion.test.ts`: 6 unit tests passing (including unit proof of late payment refund compensation).
- `packages/backend/tests/integration/checkout-expiry-race.spec.ts`: 1 comprehensive multi-customer race integration test passing.

---

## 4. Verdict
APPROVED. The commerce engine is fully resilient against reservation expiration races. Ready for duplicate webhook and retry verification (TASK-054).
