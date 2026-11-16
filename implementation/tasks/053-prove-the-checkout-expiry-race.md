# TASK-053 — Prove the Checkout Expiry Race

## Status

COMPLETED

## Goal

Build integration test suite proving late payment arrival after reservation expiry triggers automated compensation refund without overselling.

## Why This Task Exists

Proves the most dangerous commerce race condition is safely resolved without corrupted inventory counters.

## Requirement References

- G2
- G3
- IN-2
- OR-5

## Dependencies

### Blocked By
- TASK-039
- TASK-051

### Blocks
- TASK-079

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- docs/modules/commerce.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Governs precise reproduction of race conditions using interleaved test steps.
- Installation/activation required: No
- Instructions that apply to this task:
  - Artificially expire reservation
  - Deliver successful webhook and assert refund triggered

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/commerce/order-completion.ts`
- `packages/backend/src/inventory/inventory.service.ts`
- `docs/modules/inventory.md`

## Current Behavior

Not implemented. No automated test proves the late-payment-after-expiry compensation flow.

## Required Behavior

When payment webhook arrives for an order whose reservation was already EXPIRED, system detects expired reservation, transitions order to CANCELLED_EXPIRED, triggers payment refund, and leaves inventory untouched.

## Inputs / Outputs / Contracts

Test scenario in tests/integration/checkout-expiry-race.spec.ts.

## Implementation Commands

Execute in this order:

1. Author integration test tests/integration/checkout-expiry-race.spec.ts.
2. Initiate checkout for variant with stock = 1; reservation created.
3. Artificially trigger expiry sweep: reservation transitions to EXPIRED, stock available restored to 1.
4. Simulate a second customer purchasing the now-available unit; second order confirmed.
5. Deliver payment.succeeded webhook for first order.
6. Assert first order is marked CANCELLED_EXPIRED, refund compensation initiated, and inventory on_hand remains exactly 0 (no negative stock).
7. Document execution proof in docs/reviews/t053-context.md.

## Data / Database Changes

None in schema; exercises orders, reservations, refunds, and financial ledgers.

## Security Requirements

Ensures customer whose payment arrived late receives full automated refund without manual dispute.

## Error Handling

System must never crash or silently accept late payment when stock is gone.

## Edge Cases

- Item restocked before late payment arrives (must still refund; never silently resurrect expired order)

## Observability

Records expired_payment_compensated_total counter.

## Tests Required

### Unit
- None.

### Integration
- tests/integration/checkout-expiry-race.spec.ts (exact step-by-step race condition execution)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Run 'pnpm exec vitest run tests/integration/checkout-expiry-race.spec.ts'; assert test passes 100%.

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
Multiple review passes on compensation refund trigger and stock invariant safety. Documented in docs/reviews/t053-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(commerce): prove automated compensation refund on late payment after reservation expiry`

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
