# TASK-039 — Implement Expiry and Stock Adjustments

## Status

COMPLETED

## Goal

Build scheduled BullMQ worker job releasing expired stock reservations and implement seller manual stock adjustment port.

## Why This Task Exists

Restores abandoned shopping basket stock to available inventory and allows vendors to restock goods.

## Requirement References

- IN-2
- G2
- PRD Section 6.3

## Dependencies

### Blocked By
- TASK-038
- TASK-029

### Blocks
- TASK-040
- TASK-044
- TASK-053

## Architecture References

- ARCHITECTURE.md -> Synchronous vs Asynchronous
- DECISIONS.md -> DEC-005

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing expiry race conditions and manual adjustments.
- Installation/activation required: No
- Instructions that apply to this task:
  - Simulate expired reservation
  - Verify worker releases reserved counter and writes ledger

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/inventory/inventory.service.ts`
- `apps/worker/src/main.ts`
- `docs/modules/inventory.md`

## Current Behavior

Not implemented. Active reservations never expire; abandoned checkouts lock inventory indefinitely.

## Required Behavior

BullMQ repeatable job polls expired active reservations every 60 seconds; releases reserved stock; adjusts on_hand on seller restocking; records ledger entries.

## Inputs / Outputs / Contracts

adjustStock(tx, variantId, deltaOnHand, reason, operationKey) -> AdjustStockResult. ExpiryJob payload.

## Implementation Commands

Execute in this order:

1. Implement InventoryService.releaseExpiredReservations() claiming expired rows with FOR UPDATE SKIP LOCKED.
2. Execute atomic decrement on inventory.reserved and mark reservation status = 'EXPIRED'.
3. Record stock_movements entry with reason = 'RESERVATION_EXPIRED'.
4. Build adjustStock() method validating that on_hand does not fall below currently active reserved count.
5. Configure BullMQ repeatable job 'inventory-expiry-sweep' in apps/worker/src/schedulers/expiry.scheduler.ts running every minute.
6. Write integration tests in tests/integration/inventory-expiry.spec.ts.

## Data / Database Changes

Updates inventory.reserved / on_hand; updates stock_reservations.status; inserts stock_movements.

## Security Requirements

Manual stock adjustments require verified seller or admin credentials scoped to variant's store.

## Error Handling

Manual adjustment reducing on_hand below reserved throws 409 Conflict (CANNOT_REDUCE_BELOW_RESERVED).

## Edge Cases

- Payment succeeds at the exact millisecond reservation expires (T053 checkout expiry race condition)

## Observability

Records count of released reservations and total expired quantity per sweep.

## Tests Required

### Unit
- packages/backend/src/inventory/stock-adjustment.test.ts (delta calculation, negative stock guard)

### Integration
- tests/integration/inventory-expiry.spec.ts (seed expired reservation; run sweep; verify reserved decrements and available stock increases)

### End-to-End
- None.

### Security / Regression
- Assert seller cannot adjust stock for variant belonging to another store

Do not mark the task complete until required tests pass.

## Manual Verification

Insert reservation with expires_at in the past; trigger sweep job via CLI; verify reservation status updates to EXPIRED.

## Definition of Done

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
MEDIUM

Review requirements:
Single thorough review pass focusing on expiry race locks and ledger accuracy. Documented in docs/reviews/t039-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(inventory): implement reservation expiry sweep and stock adjustment port`

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
