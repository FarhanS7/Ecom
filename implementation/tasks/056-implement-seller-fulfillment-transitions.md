# TASK-056 — Implement Seller Fulfillment Transitions

## Status

COMPLETED

## Goal

Build seller fulfillment state machine transitioning suborders from PAID -> PACKED -> SHIPPED -> DELIVERED, updating tracking numbers and emitting SuborderTransitioned outbox events.

## Why This Task Exists

Enables independent vendor fulfillment without coupling shipping statuses across multiple sellers in a shared basket.

## Requirement References

- OR-2
- OR-6
- G4
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-046
- TASK-051
- TASK-018

### Blocks
- TASK-057
- TASK-058
- TASK-060

## Architecture References

- ARCHITECTURE.md -> Module boundaries
- DECISIONS.md -> DEC-011
- docs/modules/commerce.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing illegal state transitions before implementation.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test jumping from PAID directly to DELIVERED
  - Assert illegal transition throws 400 Bad Request

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs seller fulfillment API endpoint under /v1/seller/stores/{id}/orders/{suborderId}/transitions.
- Installation/activation required: No
- Instructions that apply to this task:
  - Require trackingRef when status is SHIPPED
  - Derive parent order status dynamically

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/commerce/schema.ts`
- `packages/backend/src/platform/outbox.service.ts`
- `docs/modules/commerce.md`

## Current Behavior

Not implemented. Seller suborders remain permanently in initial status; no transitions can occur.

## Required Behavior

Seller transitions suborder through strict FSM; provides trackingRef on SHIPPED; parent order status is derived dynamically (DELIVERED only when all suborders reach DELIVERED); emits SuborderTransitioned event.

## Inputs / Outputs / Contracts

FulfillmentTransitionDto: { toStatus: 'PACKED' | 'SHIPPED' | 'DELIVERED', trackingRef?: string }. SuborderTransitionedEvent.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0016-fulfillment.sql creating fulfillment_events table.
2. Implement FulfillmentFSM in packages/backend/src/commerce/fulfillment-fsm.ts enforcing legal transitions.
3. Implement FulfillmentService with scoped store verification.
4. Update seller_orders and append row to fulfillment_events in single transaction.
5. Re-evaluate and update parent orders.fulfillment_status (e.g. PARTIALLY_SHIPPED vs SHIPPED).
6. Write SuborderTransitioned event to transactional outbox.
7. Write integration tests in tests/integration/fulfillment.spec.ts.

## Data / Database Changes

Creates fulfillment_events table in migration 0016-fulfillment.sql; updates seller_orders and orders; inserts outbox.

## Security Requirements

Enforces store ownership: seller can transition only suborders belonging to their own store.

## Error Handling

Returns 400 Bad Request on illegal state transition (e.g. PAID -> DELIVERED).

## Edge Cases

- Seller 1 ships suborder, Seller 2 suborder is still PACKED (parent order fulfillment status must show PARTIALLY_SHIPPED)

## Observability

Audit log for fulfillment state transitions with tracking number.

## Tests Required

### Unit
- packages/backend/src/commerce/fulfillment-fsm.test.ts (state machine validation, illegal transition rejection)

### Integration
- tests/integration/fulfillment.spec.ts (multi-seller order; seller 1 marks packed/shipped; assert parent order reflects partially shipped; seller 2 ships; assert parent order reflects shipped)

### End-to-End
- None.

### Security / Regression
- Assert seller cannot transition suborder belonging to another vendor

Do not mark the task complete until required tests pass.

## Manual Verification

Execute fulfillment transition via curl; verify seller_orders status updates to SHIPPED with tracking number in database.

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
Single thorough review pass focusing on parent order status derivation and FSM rules. Documented in docs/reviews/t056-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(commerce): implement seller fulfillment state machine and suborder transitions`

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
