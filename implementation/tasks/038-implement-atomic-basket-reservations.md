# TASK-038 — Implement Atomic Basket Reservations

## Status

COMPLETED

## Goal

Build InventoryService.reserve() locking variants in strictly ascending ID order and applying conditional reservation increments with 15-minute TTL.

## Why This Task Exists

Prevents deadlocks under multi-item orders and mathematically guarantees overselling is impossible under high concurrency.

## Requirement References

- IN-2
- IN-3
- G2
- NFR-008
- PRD Section 6.3

## Dependencies

### Blocked By
- TASK-037

### Blocks
- TASK-039
- TASK-044
- TASK-047

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- DECISIONS.md -> DEC-005
- docs/modules/inventory.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing concurrent reservation race conditions before implementation.
- Installation/activation required: No
- Instructions that apply to this task:
  - Simulate concurrent reservations on same variant
  - Assert ascending ID locking order

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs InventoryPort contract consumed by commerce checkout coordinator.
- Installation/activation required: No
- Instructions that apply to this task:
  - Return typed ReserveResult
  - Accept UnitOfWorkContext

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/inventory/schema.ts`
- `packages/backend/src/platform/database.ts`
- `docs/modules/inventory.md`

## Current Behavior

Not implemented. No reservation service exists; checkout cannot reserve stock.

## Required Behavior

reserve(tx, checkoutId, sortedLines, expiresAt) locks variants in ascending ID order, executes single-row conditional update, inserts stock_reservations and ledger rows; returns ReserveResult.

## Inputs / Outputs / Contracts

ReserveInput: { checkoutId: string, items: Array<{ variantId: string, qty: number }>, ttlSeconds: number }. ReserveResult: { ok: true, reservationIds: string[] } | { ok: false, code: 'INSUFFICIENT_STOCK', variantId: string, available: number }.

## Implementation Commands

Execute in this order:

1. Implement InventoryService in packages/backend/src/inventory/inventory.service.ts.
2. Sort input items by variantId ASC to guarantee deterministic deadlock-free lock acquisition.
3. Execute conditional SQL update: UPDATE inventory SET reserved = reserved + :qty, version = version + 1 WHERE variant_id = :id AND (on_hand - reserved) >= :qty.
4. If rows_updated == 0, abort and return { ok: false, code: 'INSUFFICIENT_STOCK' }.
5. Insert stock_reservations with expires_at = NOW() + 15 minutes.
6. Insert stock_movements ledger record with reason = 'CHECKOUT_RESERVATION'.
7. Write integration tests in tests/integration/inventory-reserve.spec.ts.

## Data / Database Changes

Updates inventory.reserved; inserts stock_reservations and stock_movements.

## Security Requirements

Reservation calls mandate valid UnitOfWorkContext transaction.

## Error Handling

Returns typed INSUFFICIENT_STOCK result without throwing unexpected 500.

## Edge Cases

- Order contains 3 items; 2 have stock, 3rd fails (entire transaction rolls back; 0 partial reservations survive)
- Order contains duplicate variant IDs in payload (must aggregate quantities before locking)

## Observability

Logs reservation duration, variant IDs, and failure reasons; records active reservation gauge.

## Tests Required

### Unit
- packages/backend/src/inventory/inventory.service.test.ts (input sorting, payload aggregation, result mapping)

### Integration
- tests/integration/inventory-reserve.spec.ts (multi-item atomic reservation; deadlock avoidance under reverse-order concurrent calls; rollback on 3rd item failure)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Execute reserve() on variant with stock=5 requesting qty=6; verify call returns ok: false, code: 'INSUFFICIENT_STOCK'.

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
HIGH

Review requirements:
Requires two independent review passes on lock ordering and conditional update logic. Documented in docs/reviews/t038-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(inventory): implement atomic basket reservations with deadlock-free locking`

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
