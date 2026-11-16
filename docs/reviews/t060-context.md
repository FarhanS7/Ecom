# Review Context: TASK-060 — Double-Entry Financial Ledger and Refund Engine

## Review Metadata
- **Task ID**: TASK-060
- **Risk Level**: HIGH (Core financial ledgers, money movements, row-locking concurrency, and restocking invariants)
- **Review Scope**: Migration `0019-financial-ledger.sql`, `FinancialLedgerService` double-entry validator, `RefundService` cumulative cap arithmetic, row-level locks on `payment_attempts`, support policy caps, item-level restocking, and transactional outbox eventing.
- **Reviewer**: Senior Financial & Security Architect / Independent Reviewer
- **Outcome**: APPROVED

---

## 1. Executive Summary
TASK-060 establishes an immutable, double-entry financial accounting ledger adhering to DEC-012, along with a full/partial refund processing engine:
1. **Double-Entry Financial Ledger**:
   - Migration `0019-financial-ledger.sql` creates immutable, append-only `financial_entries` table with foreign key restrictions (`ON DELETE RESTRICT`) preserving audit history.
   - Enforces mathematical balance invariant: $\sum \text{debits} = \sum \text{credits}$ per operation across supported accounts (`customer_receivable`, `seller_payable`, `platform_commission`, `payment_gateway_clearing`).
   - `FinancialLedgerService` strictly validates entries before database insertion; any non-positive or unbalanced debit/credit combination throws `UnbalancedLedgerError`.
2. **Refund Engine with Cumulative Cap Protection**:
   - `RefundService.processRefund`:
     - Acquires an exclusive row lock on `payment_attempts` (`SELECT ... FOR UPDATE`), serializing concurrent refund operations and preventing double-refund race conditions (G3).
     - Aggregates historical completed refunds (`SUM(amount_cents)` from `refunds` table) and guarantees that $\sum \text{prior\_refunds} + \text{requested\_amount} \le \text{payment\_attempt.amount\_cents}$.
     - Rejects any over-allocation attempt with typed `RefundExceedsPaymentError`.
     - Automatically transitions order and payment attempt status to `REFUNDED` when the cumulative refund reaches 100% of captured payment.
     - Enforces non-escalated support policy caps ($200.00 / 20000 cents).
3. **Double-Entry Money Movements & Restocking**:
   - Each refund writes balanced entries: debits `seller_payable` (reducing seller liability) and credits `payment_gateway_clearing` (reducing captured funds).
   - If line item restocking is requested, safely calls `inventoryService.adjustStock(..., reason: 'return_restock')` and writes a movement ledger entry.
   - Transactional outbox event `order.refund_completed` is written in the exact same ACID transaction.

---

## 2. Invariant Verification

| Invariant | Status | Verification Evidence |
|---|---|---|
| **Zero-Sum Ledger Balance ($\sum \text{debits} = \sum \text{credits}$)** | PASS | `financialLedgerService.assertBalanced` validates $\sum \text{debits} == \sum \text{credits}$. Database check constraint enforces non-negative cents. Tested in `financial-ledger.service.test.ts` and `refund-ledger.spec.ts`. |
| **Row-Level Locking Concurrency** | PASS | `payment_attempts` row locked `FOR UPDATE` before evaluating remaining balance. Serializes concurrent callers. Tested in `refund.service.test.ts` and `refund-ledger.spec.ts`. |
| **Cumulative Cap Enforcement** | PASS | Rejects refund exceeding remaining balance with `RefundExceedsPaymentError`. Tested in `refund.service.test.ts` and `refund-ledger.spec.ts`. |
| **Terminal Status Transition** | PASS | Full refund updates `orders.payment_status` and `payment_attempts.status` to `REFUNDED`. Tested in `refund.service.test.ts` and `refund-ledger.spec.ts`. |
| **Optional Line-Item Restocking** | PASS | Restocks `inventory.on_hand` and writes `return_restock` ledger entry when `restock: true`. Tested in `refund.service.test.ts` and `refund-ledger.spec.ts`. |
| **Support Policy Cap Enforcement** | PASS | Support agents limited to non-escalated cap ($200.00). Rejects excess with `RefundPolicyCapExceededError`. Tested in `refund.service.test.ts`. |

---

## 3. Findings & Resolution
- **Sequential Migration Numbering**: Authored `0019-financial-ledger.sql` preserving clean sequence following `0018-returns.sql`.
- **Ledger Invariant Protection**: Added database check constraint `financial_entries_debit_or_credit_positive` ensuring no hollow zero-value entries pollute the ledger.

---

## 4. Conclusion
TASK-060 satisfies all financial integrity, double-entry mathematical balance, and concurrency constraints. Production ready.
