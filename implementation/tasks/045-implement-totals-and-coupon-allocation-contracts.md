# TASK-045 — Implement Totals and Coupon Allocation Contracts

## Status

COMPLETED

## Goal

Build canonical quote calculation engine computing seller-subtotals, fixed shipping ($5.00/seller), proportional coupon allocation, and price-change verification.

## Why This Task Exists

Guarantees shoppers receive immutable signed price quotes and prevents checkout on unreviewed price changes.

## Requirement References

- CA-3
- OR-9
- REQ-COMM-002
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-019
- TASK-041

### Blocks
- TASK-047
- TASK-048
- TASK-063

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- docs/modules/commerce.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs quote request and response DTO schemas.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use integer cents arithmetic exclusively
  - Sign quote token with HMAC

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing penny-rounding and proportional coupon splits with failing tests first.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test 3-way odd penny coupon split
  - Assert sum of line totals equals parent total

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/cart/cart.service.ts`
- `packages/backend/src/catalog/schema.ts`
- `docs/modules/commerce.md`

## Current Behavior

Not implemented. No price quote service exists; cart has no fixed shipping or coupon discount calculations.

## Required Behavior

POST /v1/checkout/quote validates items against current catalog, splits items by seller, adds $5.00 (500 cents) shipping per seller, allocates discounts proportionally, and issues signed expiring quote token.

## Inputs / Outputs / Contracts

QuoteRequestDto, QuoteResponseDto: { quoteToken: string, expiresAt: string, currency: 'USD', subtotalCents: string, shippingCents: string, discountCents: string, totalCents: string, sellers: Array<{ storeId: string, subtotalCents: string, shippingCents: string, discountCents: string, totalCents: string, items: Array<{ variantId: string, qty: number, unitPriceCents: string, totalCents: string }> }> }.

## Implementation Commands

Execute in this order:

1. Implement QuoteService in packages/backend/src/commerce/quote.service.ts.
2. Implement proportional discount allocator distributing coupon cents without losing fractional pennies.
3. Enforce fixed demo shipping of 500 cents ($5.00) per unique seller suborder.
4. Sign quote payload with HMAC-SHA256 producing acceptedQuoteToken with 15-minute expiration.
5. Expose POST /v1/checkout/quote in CommerceController.
6. Write unit and integration tests covering rounding and price shifts.

## Data / Database Changes

None in database; issues cryptographically signed JWT/HMAC token.

## Security Requirements

Quote tokens are signed with server secret; prevents client tampering with totals or prices.

## Error Handling

Returns 409 Conflict with code PRICE_CHANGED if catalog price moved since cart display.

## Edge Cases

- Coupon discount of $10.00 across 3 items ($3.33, $3.33, $3.34 - must sum exactly to 1000 cents)
- Cart contains products from 3 distinct sellers (shipping equals exactly 1500 cents)

## Observability

Quote calculation latency metrics.

## Tests Required

### Unit
- packages/backend/src/commerce/quote.service.test.ts (integer arithmetic, proportional allocation, penny rounding, shipping per seller)

### Integration
- tests/integration/quote.spec.ts (request quote, alter DB price, request second quote, assert PRICE_CHANGED detected)

### End-to-End
- None.

### Security / Regression
- Assert modified quote token is rejected with 401 INVALID_QUOTE

Do not mark the task complete until required tests pass.

## Manual Verification

Request quote with 2 items from 2 sellers; verify total equals subtotal + $10.00 shipping.

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
Single thorough review pass focusing on integer arithmetic and penny-rounding edge cases. Documented in docs/reviews/t045-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(commerce): implement canonical quote calculation and coupon allocation engine`

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
