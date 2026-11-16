# TASK-048 — Build Checkout Review and Pending-Order UI

## Status

COMPLETED

## Goal

Build Next.js checkout flow: address selector, quote summary, place-order submission with client-generated idempotency key, and pending payment status screen.

## Why This Task Exists

Provides shoppers with an intuitive, accessible multi-step checkout interface.

## Requirement References

- OR-1
- REQ-STORE-004
- design.md

## Dependencies

### Blocked By
- TASK-043
- TASK-045
- TASK-047

### Blocks
- TASK-057

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs multi-step checkout state, accessible form controls, and loading spinners.
- Installation/activation required: No
- Instructions that apply to this task:
  - Generate UUID Idempotency-Key in client
  - Disable submit button on click to prevent double submits

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/features/cart/cart-drawer.tsx`
- `apps/web/src/features/account/address-book.tsx`
- `apps/web/src/lib/api.ts`

## Current Behavior

Checkout CTA in cart drawer is a dead link; no checkout pages exist in apps/web.

## Required Behavior

Navigating to /checkout guides user through Address Selection -> Review Quote -> Submit Order with spinner -> Redirects to /orders/[id]/pending status view.

## Inputs / Outputs / Contracts

CheckoutFormState and OrderReviewProps in apps/web/src/features/checkout/.

## Implementation Commands

Execute in this order:

1. Build checkout page in apps/web/src/app/checkout/page.tsx.
2. Build AddressSelector step reusing saved customer addresses.
3. Build OrderSummary step displaying suborders, shipping fees, and total.
4. Generate crypto.randomUUID() for Idempotency-Key header on form submit.
5. Build OrderPendingScreen polling or waiting for payment confirmation.
6. Write component tests and form interaction tests.

## Data / Database Changes

None.

## Security Requirements

Enforces HTTPS transport; prevents submission if quote token is expired.

## Error Handling

Displays reviewable banner if backend returns 409 PRICE_CHANGED or INSUFFICIENT_STOCK with link back to cart.

## Edge Cases

- User has zero saved addresses (prompts inline new address form without leaving checkout)

## Observability

Checkout funnel step drop-off analytics.

## Tests Required

### Unit
- apps/web/src/features/checkout/checkout-form.test.tsx (step navigation, address selection, submission button disabled state)

### Integration
- apps/web/src/features/checkout/checkout-flow.test.ts (fetch quote, submit checkout, assert redirect)

### End-to-End
- tests/e2e/checkout.spec.ts (complete purchase from cart to pending order confirmation screen)

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Complete checkout in browser; verify order summary displays split seller items and redirects to confirmation screen.

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
LOW

Review requirements:
Single review pass focusing on double-click submission prevention and mobile layout. Documented in docs/reviews/t048-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build multi-step checkout review and pending order confirmation screens`

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
