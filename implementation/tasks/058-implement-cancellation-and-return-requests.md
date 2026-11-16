# TASK-058 — Implement Cancellation and Return Requests

## Status

COMPLETED

## Goal

Build cancellation for unshipped order lines and customer return request workflow with return reasons, items, and physical inspection states.

## Why This Task Exists

Enables customers to cancel unshipped items or request returns on delivered goods, protecting inventory and financial records.

## Requirement References

- OR-2
- REQ-COMM-003
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-055
- TASK-056

### Blocks
- TASK-059
- TASK-060

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- docs/modules/commerce.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs cancellation and return request DTOs and state machines.
- Installation/activation required: No
- Instructions that apply to this task:
  - Disallow cancelling already-shipped items
  - Enforce return quantity <= purchased quantity

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing return limits and status constraints with failing tests first.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test requesting return on cancelled order
  - Test returning more items than purchased

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/commerce/schema.ts`
- `packages/backend/src/commerce/order-query.service.ts`
- `docs/modules/commerce.md`

## Current Behavior

Not implemented. Orders cannot be cancelled; returns are not modeled.

## Required Behavior

Customers can cancel unshipped order lines (triggers automated refund); customers can submit return requests on delivered items with reasons; returns require seller inspection.

## Inputs / Outputs / Contracts

CreateReturnRequestDto: { orderItemId: string, qty: number, reason: string }. ReturnRequestDto: { id: string, status: 'PENDING_INSPECTION' | 'APPROVED' | 'REJECTED', inspectionResult?: string }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0017-returns.sql creating return_requests table.
2. Implement CancellationService: verifies suborder is unshipped; cancels lines; triggers refund; releases/restocks inventory.
3. Implement ReturnService: verifies order is DELIVERED; checks cumulative returned quantity; creates return request.
4. Expose POST /v1/orders/:id/cancel and POST /v1/orders/:id/returns in CommerceController.
5. Write integration tests in tests/integration/returns.spec.ts.

## Data / Database Changes

Creates return_requests table in migration 0017-returns.sql; updates orders and seller_orders.

## Security Requirements

Enforces customer ownership: user can cancel or return only items from their own orders.

## Error Handling

Returns 400 Bad Request if order is already SHIPPED during cancellation attempt; 409 if return quantity exceeds purchased count.

## Edge Cases

- Customer purchased 3 units, previously returned 1, attempts to return 3 more (rejected: max returnable is 2)

## Observability

Audit log for order cancellation and return submissions.

## Tests Required

### Unit
- packages/backend/src/commerce/return.service.test.ts (quantity cap logic, status validation)

### Integration
- tests/integration/returns.spec.ts (cancel unshipped order; submit return on delivered order; assert return request persisted)

### End-to-End
- None.

### Security / Regression
- Assert user cannot cancel or return an order belonging to another customer

Do not mark the task complete until required tests pass.

## Manual Verification

Submit return request via curl for delivered item; verify return_requests row created with PENDING_INSPECTION status.

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

## Independent Review Requirement

Risk Level:
MEDIUM

Review requirements:
Single thorough review pass focusing on cumulative return quantity caps. Documented in docs/reviews/t058-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(commerce): implement order cancellation and customer return request workflows`

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
