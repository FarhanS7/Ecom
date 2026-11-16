# TASK-060 — Implement Partial Refunds and Balanced Ledger

## Status

COMPLETED

## Goal

Build double-entry financial ledger service and refund engine supporting full/partial refunds, cumulative cap enforcement, and restocking.

## Why This Task Exists

Guarantees that all financial money movements balance to zero and prevents refunding more than captured payments.

## Requirement References

- OR-8
- G3
- REQ-COMM-004
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-051
- TASK-056
- TASK-058

### Blocks
- TASK-069
- TASK-070

## Architecture References

- ARCHITECTURE.md -> Data Model
- DECISIONS.md -> DEC-012
- docs/modules/payments.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing double-entry ledger balance and concurrent refund race conditions.
- Installation/activation required: No
- Instructions that apply to this task:
  - Assert sum(debit_cents) == sum(credit_cents)
  - Test two concurrent partial refunds exceeding total

### Skill 2: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs financial locks and cumulative refund caps.
- Installation/activation required: No
- Instructions that apply to this task:
  - Lock parent payment record FOR UPDATE during refund allocation
  - Reject cumulative refund > captured amount

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/payments/payment.service.ts`
- `packages/backend/src/inventory/inventory.service.ts`
- `docs/modules/payments.md`

## Current Behavior

Not implemented. No financial ledger tables exist; refunds cannot be issued.

## Required Behavior

RefundService locks parent payment; calculates remaining refundable balance; executes mock refund; writes balanced debits and credits to financial_entries; restocks inventory if approved; writes RefundCompleted outbox event.

## Inputs / Outputs / Contracts

financial_entries: (id PK, operation_key text, order_id FK, refund_id FK nullable, store_id FK nullable, account text, debit_cents bigint, credit_cents bigint, created_at timestamptz).

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0018-financial-ledger.sql creating refunds, refund_items, and financial_entries tables.
2. Implement FinancialLedgerService in packages/backend/src/payments/financial-ledger.service.ts with balanced entry validator.
3. Implement RefundService in packages/backend/src/payments/refund.service.ts locking payment attempt with SELECT ... FOR UPDATE.
4. Ensure: sum(prior_refunds) + current_refund <= payment_attempt.amount_cents.
5. Insert balanced financial_entries: debit seller_payable, credit customer_receivable.
6. If restock requested: call InventoryService.adjustStock(tx, variantId, qty, 'RETURN_RESTOCK').
7. Write RefundCompleted event to transactional outbox.
8. Write integration tests in tests/integration/refund-ledger.spec.ts.

## Data / Database Changes

Creates refunds, refund_items, and financial_entries tables in migration 0018-financial-ledger.sql.

## Security Requirements

Refund operations require authorized seller, support, or admin actor; payment row locking prevents concurrent double-refunds.

## Error Handling

Returns 409 Conflict with code REFUND_EXCEEDS_PAYMENT if requested amount exceeds captured total.

## Edge Cases

- Two support agents issue partial refunds of $60 on a $100 order simultaneously (row lock ensures second call is rejected for exceeding $100)

## Observability

Audit log for every refund with actor ID, reason, and amount; records total_refunded_cents metric.

## Tests Required

### Unit
- packages/backend/src/payments/financial-ledger.service.test.ts (balanced debit/credit validation, account balance assertions)

### Integration
- tests/integration/refund-ledger.spec.ts (issue partial refund; verify financial ledger balances; issue second refund exceeding remaining balance; assert rejection)

### End-to-End
- None.

### Security / Regression
- Verify support agent cannot refund more than configured policy cap ($200.00)

Do not mark the task complete until required tests pass.

## Manual Verification

Execute partial refund of $25.00 via API; query financial_entries; assert sum(debit_cents) - sum(credit_cents) == 0.

## Definition of Done

- [ ] Required skills inspected and activated
- [ ] Requirement behavior implemented
- [ ] Architecture rules followed
- [ ] Security requirements satisfied
- [ ] Tests added
- [ ] Relevant tests pass
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Documentation updated where required
- [ ] Requirement traceability updated
- [ ] Independent review completed according to risk
- [ ] No unresolved blocking review findings
- [ ] Manual verification completed when required
- [x] Required skills inspected and activated
- [x] Requirement behavior implemented
- [x] Architecture rules followed
- [x] Security requirements satisfied
- [x] Tests added
- [x] Relevant tests pass
- [x] Lint passes
- [x] Typecheck passes
- [x] Build passes
- [x] Documentation updated where required
- [x] Requirement traceability updated
- [x] Independent review completed according to risk
- [x] No unresolved blocking review findings
- [x] Manual verification completed when required

## Independent Review Requirement

Risk Level:
HIGH

Review requirements:
Multiple review passes on row-level locking, cumulative cap arithmetic, and double-entry balance. Documented in docs/reviews/t060-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(payments): implement partial refunds with balanced double-entry financial ledger`

Only commit a meaningful green change.

## Completion Report

When finished, report:

- files changed,
- migrations created,
- tests added,
- commands executed,
- test results,
- assumptions,
- known limitations,
- review status,
- manual verification status.

Do not simply report "done."
