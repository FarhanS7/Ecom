# TASK-054 — Prove Retry and Duplicate-Webhook Safety

## Status

COMPLETED

## Goal

Build automated concurrency test suite proving that 20 duplicate checkout requests and duplicate payment webhooks produce exactly 1 order, 1 charge, and 1 stock decrement.

## Why This Task Exists

Provides indisputable proof of PRD Goal G3 (Payments are safe to retry; duplicate webhook tests).

## Requirement References

- G3
- OR-1
- OR-3
- NFR-009
- PRD Section 1.2

## Dependencies

### Blocked By
- TASK-047
- TASK-050
- TASK-051

### Blocks
- TASK-079

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- DECISIONS.md -> DEC-008

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs concurrent HTTP replay storm scripting.
- Installation/activation required: No
- Instructions that apply to this task:
  - Fire 20 identical checkout requests simultaneously
  - Assert exactly 1 charge executed

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces strict validation of idempotency invariants under concurrent bursts.
- Installation/activation required: No
- Instructions that apply to this task:
  - Verify all 20 responses return identical orderId
  - Assert zero duplicate database rows

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/commerce/checkout.service.ts`
- `packages/backend/src/payments/webhook.service.ts`
- `loadtests/retry-storm.js`

## Current Behavior

Not implemented. No automated suite fires concurrent replays to prove single-effect idempotency.

## Required Behavior

20 concurrent identical checkout requests produce 1 order, 1 payment attempt, and identical 201 responses; 20 concurrent duplicate webhook callbacks produce 1 payment confirmation.

## Inputs / Outputs / Contracts

k6 scenario script in loadtests/retry-storm.js.

## Implementation Commands

Execute in this order:

1. Author loadtests/retry-storm.js firing 20 concurrent POST /v1/checkout requests sharing the same Idempotency-Key and user session.
2. Assert all 20 responses return HTTP 201 with identical orderId and payload hashes.
3. Query database: assert count(orders) == 1, count(payment_attempts) == 1.
4. Fire 20 duplicate webhook events with identical eventId to POST /v1/webhooks/payments simultaneously.
5. Assert exactly 1 webhook_events entry processed and 1 OrderPaid event generated.
6. Document execution proof in docs/reviews/t054-context.md.

## Data / Database Changes

None in schema; exercises idempotency_requests and webhook_events.

## Security Requirements

Proves protection against double-charging and race exploitation.

## Error Handling

All concurrent duplicate calls must resolve cleanly without deadlock or 500 error.

## Edge Cases

- All 20 requests hit the server at the exact same microsecond (PostgreSQL UNIQUE constraint on idempotency key enforces exactly one winner)

## Observability

Idempotency cache hit rate metrics.

## Tests Required

### Unit
- None.

### Integration
- tests/integration/idempotency-concurrency.spec.ts (Promise.all simultaneous replay verification)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Execute 'pnpm exec k6 run loadtests/retry-storm.js'; verify terminal outputs 0 failures and exactly 1 order created.

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
Multiple review passes on idempotency uniqueness locks and replay proof. Documented in docs/reviews/t054-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(commerce): prove idempotency replay storm produces exactly one order and charge`

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
