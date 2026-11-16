# TASK-043 — Build Cart and Add-to-Cart Interactions

## Status

COMPLETED

## Goal

Build Next.js cart drawer, item count badge, quantity modification controls, and channel basket separation UI.

## Why This Task Exists

Provides shoppers with an interactive, responsive basket experience across marketplace and branded stores.

## Requirement References

- CA-1
- CA-2
- design.md

## Dependencies

### Blocked By
- TASK-023
- TASK-025
- TASK-026
- TASK-041
- TASK-042

### Blocks
- TASK-048

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs accessible cart drawer, optimistic UI updates, and focus trapping.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use Dialog with focus trap for cart drawer
  - Provide optimistic quantity updates

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/layout.tsx`
- `apps/web/src/features/catalog/product-detail.tsx`
- `apps/web/src/lib/api.ts`

## Current Behavior

PDP has disabled 'Add to Cart' button; header has static cart icon with no drawer.

## Required Behavior

Clicking 'Add to Cart' on PDP adds item, updates header badge count, and slides open the cart drawer showing item details, subtotal, and Checkout CTA.

## Inputs / Outputs / Contracts

CartState context and CartDrawerProps in apps/web/src/features/cart/.

## Implementation Commands

Execute in this order:

1. Build CartProvider React context managing active cart state and channelKey.
2. Build CartDrawer client island with slide-over animation and focus trap.
3. Build CartItemRow component with quantity increment/decrement buttons and remove icon.
4. Wire PDP 'Add to Cart' button to CartProvider.addItem().
5. Write component tests and responsive UI tests.

## Data / Database Changes

None.

## Security Requirements

Enforces CSRF protection on cart mutation calls; sanitizes product titles in drawer.

## Error Handling

Displays inline toast error if stock limit is reached when incrementing quantity.

## Edge Cases

- Rapidly clicking '+' button (debounces mutation call and prevents negative/overflow quantities)

## Observability

Cart add and abandon analytics tracking.

## Tests Required

### Unit
- apps/web/src/features/cart/cart-drawer.test.tsx (drawer open/close, quantity adjustments, empty state)

### Integration
- apps/web/src/features/cart/cart-flow.test.ts (add item, verify state, trigger checkout navigation)

### End-to-End
- tests/e2e/cart-drawer.spec.ts (visit PDP, select variant, click Add to Cart, assert drawer opens with correct price)

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Add product to cart; open drawer; change quantity from 1 to 3; verify total updates instantly.

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
Single review pass focusing on accessibility and keyboard focus trapping. Documented in docs/reviews/t043-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build interactive cart drawer and add-to-cart controls`

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
