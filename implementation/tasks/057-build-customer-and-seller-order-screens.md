# TASK-057 — Build Customer and Seller Order Screens

## Status

COMPLETED

## Goal

Build Next.js customer order tracking portal (/account/orders/[id]) and seller fulfillment management console (/seller/orders).

## Why This Task Exists

Provides visual interfaces for shoppers to track packages and for merchants to manage fulfillment.

## Requirement References

- OR-2
- OR-6
- design.md

## Dependencies

### Blocked By
- TASK-048
- TASK-055
- TASK-056

### Blocks
- TASK-059

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs order timeline visual steps, tracking badges, and seller fulfillment action dialogs.
- Installation/activation required: No
- Instructions that apply to this task:
  - Render horizontal visual progress stepper
  - Show tracking number with carrier lookup placeholder

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/account/page.tsx`
- `apps/web/src/features/seller/actions.ts`
- `apps/web/src/components/ui/badge.tsx`

## Current Behavior

Customer account order list and seller order management consoles do not exist.

## Required Behavior

Customer can view order tracking with visual progress stepper; seller can inspect customer shipping details and advance fulfillment states via action buttons.

## Inputs / Outputs / Contracts

CustomerOrderDetailProps and SellerOrderManagementProps in apps/web/src/features/orders/.

## Implementation Commands

Execute in this order:

1. Build customer order history and detail pages in apps/web/src/app/account/orders/.
2. Build visual OrderProgressStepper component (Pending -> Paid -> Packed -> Shipped -> Delivered).
3. Build seller order dashboard in apps/web/src/app/seller/orders/.
4. Implement fulfillment transition action modal (Pack Order, Enter Tracking & Ship).
5. Write component tests and interaction tests.

## Data / Database Changes

None.

## Security Requirements

Enforces session authorization; seller console requires valid store membership.

## Error Handling

Displays inline toast error if fulfillment transition fails on backend.

## Edge Cases

- Customer viewing multi-seller order with mixed fulfillment statuses (renders separate tracking cards per seller)

## Observability

Order detail page views and action tracking.

## Tests Required

### Unit
- apps/web/src/features/orders/progress-stepper.test.tsx (active step highlighting, status color coding)

### Integration
- apps/web/src/features/orders/fulfillment-action.test.ts (seller action advances suborder state)

### End-to-End
- tests/e2e/order-fulfillment.spec.ts (customer places order; seller logs in, ships order; customer views updated tracking status)

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Advance suborder to SHIPPED in /seller/orders; open /account/orders in customer tab; verify tracking number displays with Shipped status.

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
LOW

Review requirements:
Single review pass focusing on responsive layout and stepper accessibility. Documented in docs/reviews/t057-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build customer order tracking view and seller fulfillment management screens`

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
