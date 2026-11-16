# TASK-055 — Implement Scoped Order History and Detail

## Status

COMPLETED

## Goal

Build customer order history endpoints and seller-scoped order queries with PII masking for unfulfilled orders.

## Why This Task Exists

Enables customers to review purchases and gives vendors fulfillment views while protecting customer privacy.

## Requirement References

- OR-2
- G4
- PRD Section 5.2
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-046
- TASK-051
- TASK-091

### Blocks
- TASK-057
- TASK-058

## Architecture References

- ARCHITECTURE.md -> Authorization
- docs/modules/commerce.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs customer and seller order response DTOs and keyset pagination.
- Installation/activation required: No
- Instructions that apply to this task:
  - Mask PII until order status is PAID
  - Scope seller orders strictly to their items

### Skill 2: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Enforces ABAC privacy masking and tenancy scoping.
- Installation/activation required: No
- Instructions that apply to this task:
  - Mask street and phone for unpaid orders
  - Enforce user ownership on customer routes

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/commerce/schema.ts`
- `packages/contracts/src/identity.ts`
- `docs/modules/commerce.md`

## Current Behavior

Not implemented. No endpoints exist to view customer orders or seller suborders.

## Required Behavior

GET /v1/orders returns customer's orders; GET /v1/seller/stores/{id}/orders returns only suborders belonging to that store; customer PII is masked until status is PAID.

## Inputs / Outputs / Contracts

CustomerOrderDto, SellerOrderDto in @shopscale/contracts.

## Implementation Commands

Execute in this order:

1. Implement OrderQueryService in packages/backend/src/commerce/order-query.service.ts.
2. Build customer order listing with keyset cursor pagination on (created_at DESC, id DESC).
3. Build seller suborder query joining seller_orders and order_items strictly scoped by store_id.
4. Implement PIIMasker utility masking recipient name and street address for unpaid orders.
5. Expose GET /v1/orders, GET /v1/orders/:id, and GET /v1/seller/stores/:id/orders in CommerceController.
6. Write integration tests in tests/integration/order-query.spec.ts.

## Data / Database Changes

None.

## Security Requirements

Enforces store scoping: seller cannot see other vendors' order items or totals.

## Error Handling

Returns 404 Not Found if customer attempts to view another user's order ID.

## Edge Cases

- Customer has 200+ orders (keyset cursor pagination prevents slow deep queries)

## Observability

Order history query duration metrics.

## Tests Required

### Unit
- packages/backend/src/commerce/pii-masker.test.ts (PII masking rules based on payment status)

### Integration
- tests/integration/order-query.spec.ts (customer views own orders; seller views only their suborder items; assert cross-seller isolation)

### End-to-End
- None.

### Security / Regression
- Assert seller querying another store's suborders receives 404 Not Found

Do not mark the task complete until required tests pass.

## Manual Verification

Fetch /v1/seller/stores/{seller1StoreId}/orders; verify order items from Seller 2 are completely absent.

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
Single thorough review pass focusing on cross-seller data isolation. Documented in docs/reviews/t055-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(commerce): implement customer order history and seller suborder query with pii masking`

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
