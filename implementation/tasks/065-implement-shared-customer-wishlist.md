# TASK-065 — Implement Shared Customer Wishlist

## Status

COMPLETED

## Goal

Build customer wishlist endpoints, database schema, and Next.js wishlist dashboard (/account/wishlist) with product availability indicators.

## Why This Task Exists

Enables shoppers to save favorite items across marketplace and branded stores for future purchase.

## Requirement References

- REQ-ENG-001
- design.md

## Dependencies

### Blocked By
- TASK-019
- TASK-009

### Blocks
- TASK-075

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/modules/engagement.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs wishlist CRUD contracts and customer scoping.
- Installation/activation required: No
- Instructions that apply to this task:
  - Scope wishlists to authenticated user
  - Render unavailable badge if product is archived

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/read.service.ts`
- `apps/web/src/features/catalog/product-detail.tsx`
- `docs/modules/engagement.md`

## Current Behavior

Heart icons on product cards and PDP are decorative; no wishlist storage exists.

## Required Behavior

Clicking heart toggles wishlist membership; GET /v1/wishlist returns saved items; /account/wishlist displays saved products with quick Add-to-Cart buttons.

## Inputs / Outputs / Contracts

WishlistDto: { items: Array<{ productId: string, title: string, slug: string, priceCents: string, available: boolean }> }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0022-wishlists.sql creating wishlists table with PK(user_id, product_id).
2. Implement WishlistService in packages/backend/src/engagement/wishlist.service.ts.
3. Expose GET /v1/wishlist, PUT /v1/wishlist/:productId, and DELETE /v1/wishlist/:productId.
4. Build WishlistHeartButton component in apps/web/src/features/wishlist/wishlist-button.tsx.
5. Build WishlistPage in apps/web/src/app/account/wishlist/page.tsx.
6. Write component and integration tests.

## Data / Database Changes

Creates wishlists table in migration 0022-wishlists.sql.

## Security Requirements

Enforces user ownership: customer can view/modify only their own wishlist.

## Error Handling

Gracefully handles adding a non-existent product ID with 404 Not Found.

## Edge Cases

- Product on wishlist is archived by vendor (renders item with 'Unavailable' badge without crashing wishlist page)

## Observability

Wishlist addition telemetry.

## Tests Required

### Unit
- apps/web/src/features/wishlist/wishlist-button.test.tsx (active state toggle, optimistic update)

### Integration
- tests/integration/wishlist.spec.ts (add product, list wishlist, remove product, verify DB state)

### End-to-End
- tests/e2e/wishlist.spec.ts (save product to wishlist from PDP, navigate to /account/wishlist, assert item present)

### Security / Regression
- Assert user cannot read another customer's wishlist

Do not mark the task complete until required tests pass.

## Manual Verification

Click heart on running shoes; navigate to /account/wishlist; verify shoes are listed with price.

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
Single review pass. Documented in docs/reviews/t065-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(engagement): implement customer wishlist endpoints and account dashboard`

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
