# TASK-051 — Confirm Paid Orders and Compensate Failures

## Status

COMPLETED

## Goal

Build payment completion saga: on successful PaymentObserved event, transition order & suborders to PAID, confirm inventory decrements (on_hand -= qty, reserved -= qty); on failure, release reserved stock and mark CANCELLED.

## Why This Task Exists

Guarantees that paid orders commit stock permanently and failed/declined orders cleanly release inventory without manual intervention.

## Requirement References

- OR-2
- OR-5
- IN-1
- G2
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-046
- TASK-047
- TASK-050

### Blocks
- TASK-055
- TASK-056
- TASK-060

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- DECISIONS.md -> DEC-005
- docs/modules/commerce.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing stock confirmation and compensation rollbacks.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test successful payment confirms on_hand -= qty and reserved -= qty
  - Test declined payment releases reserved stock

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs OrderPaid and OrderCancelled event emissions.
- Installation/activation required: No
- Instructions that apply to this task:
  - Emit OrderPaid event with seller suborder IDs
  - Write append-only stock movement ledger

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/inventory/inventory.service.ts`
- `packages/backend/src/commerce/checkout.service.ts`
- `apps/worker/src/main.ts`
- `docs/architecture/events.md`

## Current Behavior

Not implemented. PaymentObserved events do not update order status or finalize inventory.

## Required Behavior

OrderPaidHandler transitions orders and seller_orders to PAID; confirms inventory; writes stock_movements (CHECKOUT_CONFIRM); emits OrderPaid outbox event. On payment failure, releases reservation, transitions to CANCELLED.

## Inputs / Outputs / Contracts

OrderPaidEvent: { orderId: string, sellerOrderIds: string[], totalCents: string, currency: 'USD' }.

## Implementation Commands

Execute in this order:

1. Implement OrderCompletionHandler in packages/backend/src/commerce/order-completion.ts.
2. On payment.succeeded: execute transaction updating orders.payment_status = 'PAID', seller_orders.fulfillment_status = 'PAID'.
3. Call InventoryService.confirmReservation(tx, checkoutId) executing: UPDATE inventory SET on_hand = on_hand - reserved, reserved = 0.
4. Insert stock_movements entry with reason = 'CHECKOUT_CONFIRMED'.
5. On payment.failed: call InventoryService.releaseReservation(tx, checkoutId, 'PAYMENT_FAILED') and update order to CANCELLED.
6. Wire worker consumer in apps/worker/src/consumers/order-completion.consumer.ts.
7. Write comprehensive saga integration tests in tests/integration/order-saga.spec.ts.

## Data / Database Changes

Updates orders, seller_orders, inventory (on_hand, reserved); updates stock_reservations; inserts stock_movements and outbox.

## Security Requirements

Order confirmation transactions run internally with system authority; cannot be triggered directly by public HTTP endpoints.

## Error Handling

Failed saga steps trigger BullMQ retry; unrecoverable errors alert support queue without dropping order record.

## Edge Cases

- Late payment webhook for order whose reservation already expired (handled in T053 compensation refund flow)

## Observability

Logs order confirmation latency; records orders_paid_total metric.

## Tests Required

### Unit
- packages/backend/src/commerce/order-completion.test.ts (state machine transitions, compensation logic)

### Integration
- tests/integration/order-saga.spec.ts (full flow: PaymentObserved -> order PAID -> stock on_hand & reserved decremented -> OrderPaid event emitted)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Deliver successful webhook; check database orders table; verify status is PAID and inventory on_hand is decremented.

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
Multiple review passes on inventory decrement arithmetic and failure compensation logic. Documented in docs/reviews/t051-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(commerce): implement order confirmation saga and inventory settlement`

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
