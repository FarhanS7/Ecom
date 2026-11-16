# TASK-063 — Build Coupon Management and Redemption UI

## Status

COMPLETED

## Goal

Build coupon creation and management interface in seller/admin consoles and coupon application input in checkout drawer.

## Why This Task Exists

Enables vendors and platform operators to offer promotional discounts and allows shoppers to redeem valid discount codes.

## Requirement References

- OR-9
- design.md
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-045
- TASK-027

### Blocks
- TASK-075

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs coupon form input, inline discount breakdown, and error toasts.
- Installation/activation required: No
- Instructions that apply to this task:
  - Provide coupon code input in cart and checkout
  - Show discount amount inline in price breakdown

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/features/checkout/checkout-form.tsx`
- `packages/backend/src/commerce/quote.service.ts`
- `apps/web/src/components/ui/input.tsx`

## Current Behavior

Checkout has no coupon code input; seller console cannot author promotional discounts.

## Required Behavior

Seller can author percentage/fixed coupons with validity dates; shopper enters coupon code at checkout; discount reflects immediately in quote breakdown.

## Inputs / Outputs / Contracts

CouponDto: { code: string, kind: 'PERCENT' | 'FIXED', value: number, startsAt: string, endsAt: string, globalLimit: number, perUserLimit: number }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0020-coupons.sql creating coupons, coupon_uses, and coupon_user_counters tables.
2. Build CouponService with atomic increment on coupon_uses under row lock.
3. Build CouponManagementTable in apps/web/src/app/seller/coupons/page.tsx.
4. Add CouponInput component to CartDrawer and CheckoutForm.
5. Write component tests and redemption integration tests.

## Data / Database Changes

Creates coupons, coupon_uses, and coupon_user_counters tables in migration 0020-coupons.sql.

## Security Requirements

Enforces store scoping: store coupons apply only to products from that specific store; global limits enforced atomically.

## Error Handling

Displays inline message if coupon is expired, invalid, or usage limit is exceeded.

## Edge Cases

- User attempts to redeem coupon twice when perUserLimit = 1 (rejected with 409 COUPON_LIMIT_EXCEEDED)

## Observability

Tracks coupon redemption rate and revenue discount metrics.

## Tests Required

### Unit
- apps/web/src/features/checkout/coupon-input.test.tsx (code submission, active discount badge, removal)

### Integration
- tests/integration/coupons.spec.ts (create coupon; redeem in checkout; assert usage count increments; assert second redemption blocked)

### End-to-End
- tests/e2e/coupons.spec.ts (create coupon as seller, apply coupon at checkout, verify final total decreases)

### Security / Regression
- Assert store coupon does not discount products from other stores in marketplace basket

Do not mark the task complete until required tests pass.

## Manual Verification

Create coupon 'SAVE10'; apply at checkout; verify order total decreases by $10.00.

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
Single thorough review pass focusing on atomic usage counting and store-scoped discount boundaries. Documented in docs/reviews/t063-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(promotions): implement coupon management and checkout redemption interface`

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
