# TASK-052 — Reconcile Uncertain Payment Outcomes

## Status

COMPLETED

## Goal

Build scheduled reconciliation worker querying the payment provider for abandoned or timed-out checkout sessions.

## Why This Task Exists

Recovers orders where client timed out or webhook was delayed, guaranteeing no customer is charged without an order.

## Requirement References

- G3
- OR-5
- PRD Section 1.2

## Dependencies

### Blocked By
- TASK-049
- TASK-050
- TASK-051

### Blocks
- TASK-073

## Architecture References

- ARCHITECTURE.md -> Synchronous vs Asynchronous
- docs/modules/payments.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing reconciliation against timed-out simulator responses.
- Installation/activation required: No
- Instructions that apply to this task:
  - Simulate dropped webhook
  - Assert reconciliation job discovers charge and confirms order

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/payments/payment.service.ts`
- `apps/worker/src/main.ts`
- `docs/modules/payments.md`

## Current Behavior

Not implemented. If a webhook fails to deliver or client times out, order remains in PENDING status forever.

## Required Behavior

Reconciliation worker runs every 5 minutes; finds PENDING orders older than 10 minutes; queries payment provider by effectKey; confirms order if provider charged, or cancels order if abandoned.

## Inputs / Outputs / Contracts

lookupEffect(effectKey) -> { status: 'CAPTURED' | 'FAILED' | 'NOT_FOUND', amountCents: string, providerRef: string }.

## Implementation Commands

Execute in this order:

1. Implement PaymentReconciliationService in packages/backend/src/payments/reconciliation.service.ts.
2. Build query scanning orders WHERE payment_status = 'PENDING' AND created_at < NOW() - INTERVAL '10 minutes'.
3. Query PaymentPort.lookupEffect(paymentEffectKey) to determine true provider state.
4. If CAPTURED: synthesize PaymentObserved event to confirm order.
5. If NOT_FOUND or FAILED: cancel order and release reservation.
6. Schedule BullMQ repeatable job 'payment-reconciliation' in apps/worker.
7. Write integration tests in tests/integration/payment-reconciliation.spec.ts.

## Data / Database Changes

Updates orders, inventory; inserts outbox.

## Security Requirements

Reconciliation job uses internal system credentials with rate-limited provider queries.

## Error Handling

Provider network errors back off and retry on subsequent scheduled run without altering order state.

## Edge Cases

- Provider charge is still in 'processing' status (leaves order in PENDING to retry next cycle)

## Observability

Records count of reconciled orders and discrepancies resolved.

## Tests Required

### Unit
- packages/backend/src/payments/reconciliation.service.test.ts (lookup dispatch, resolution branching)

### Integration
- tests/integration/payment-reconciliation.spec.ts (seed pending order with captured charge in simulator; run job; verify order transitions to PAID)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Create pending order without webhook; run reconciliation CLI; verify order updates to PAID automatically.

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
MEDIUM

Review requirements:
Single thorough review pass focusing on idempotent reconciliation outcomes. Documented in docs/reviews/t052-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(payments): implement payment reconciliation worker for timed-out sessions`

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
