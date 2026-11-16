# TASK-047 — Implement Idempotent Checkout Creation

## Status

COMPLETED

## Goal

Build atomic checkout coordinator: verifies quote, requires Idempotency-Key, reserves inventory, creates parent order and seller suborders, and emits CheckoutReserved outbox event in one transaction.

## Why This Task Exists

Provides rock-solid transactional checkout creation immune to network retries, race conditions, and overselling.

## Requirement References

- OR-1
- OR-4
- IN-2
- G2
- G3
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-038
- TASK-041
- TASK-045
- TASK-046
- TASK-091
- TASK-029

### Blocks
- TASK-048
- TASK-050
- TASK-051
- TASK-054

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- DECISIONS.md -> DEC-005
- DEC-011
- docs/modules/commerce.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing retry storm and atomic rollback before implementation.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test sending duplicate Idempotency-Key
  - Assert one transaction for order, reservation, and outbox

### Skill 2: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs idempotency key validation and request hashing.
- Installation/activation required: No
- Instructions that apply to this task:
  - Hash request payload with SHA-256
  - Reject key reuse with modified body as 409 Conflict

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/inventory/inventory.service.ts`
- `packages/backend/src/commerce/quote.service.ts`
- `packages/backend/src/platform/outbox.service.ts`
- `packages/backend/src/platform/database.ts`

## Current Behavior

Not implemented. POST /v1/checkout route does not exist; shoppers cannot initiate orders.

## Required Behavior

POST /v1/checkout validates Idempotency-Key header; checks existing requests; validates quote token; reserves stock; snapshots address; inserts order, suborders, and outbox event; returns 201 Created with order ID and payment effect key.

## Inputs / Outputs / Contracts

CheckoutRequestDto: { channelKey: string, cartVersion: number, addressId: string, acceptedQuoteToken: string }. Header: Idempotency-Key: UUID. Response: CheckoutAcceptedDto: { orderId: string, status: 'PENDING', paymentEffectKey: string, totalCents: string, expiresAt: string }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0014-idempotency.sql creating idempotency_requests table with UNIQUE(user_id, operation, channel_key, key).
2. Implement CheckoutCoordinator in packages/backend/src/commerce/checkout.service.ts.
3. Execute single UnitOfWorkContext transaction containing: idempotency check, InventoryService.reserve(), address snapshot, order & suborders insert, and OutboxWriter.write(CheckoutReserved).
4. Expose POST /v1/checkout in CommerceController with Fastify idempotency guard.
5. Write comprehensive integration tests in tests/integration/checkout.spec.ts.

## Data / Database Changes

Inserts idempotency_requests, orders, seller_orders, order_items, stock_reservations, and outbox in single ACID transaction.

## Security Requirements

Mandates authenticated customer session; validates addressId belongs to current user; verifies quote token signature.

## Error Handling

Returns 400 on missing Idempotency-Key; 409 Conflict on payload mismatch or INSUFFICIENT_STOCK; 401 on expired quote.

## Edge Cases

- Client retries exact request 5 seconds later (idempotency table returns original 201 response without re-executing reservation)
- Stock fails on item 2 of 4 (entire transaction rolls back; 0 orders or partial reservations created)

## Observability

Logs checkout initiation duration and order ID; records checkout_requests_total metric.

## Tests Required

### Unit
- packages/backend/src/commerce/checkout.service.test.ts (input validation, suborder grouping, idempotency key hashing)

### Integration
- tests/integration/checkout.spec.ts (full atomic checkout; assert order + suborders + reservations + outbox committed together; assert duplicate key returns cached response)

### End-to-End
- None.

### Security / Regression
- Assert reusing idempotency key with modified addressId returns 409 Conflict

Do not mark the task complete until required tests pass.

## Manual Verification

Submit POST /v1/checkout via curl with Idempotency-Key header; inspect database; verify 1 order, suborders, and outbox record created.

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
Requires two independent review passes on ACID transaction boundaries and idempotency hashing. Documented in docs/reviews/t047-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(commerce): implement idempotent atomic checkout creation with stock reservation`

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
