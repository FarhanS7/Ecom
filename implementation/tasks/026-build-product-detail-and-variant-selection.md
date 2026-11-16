# TASK-026 — Build Product Detail and Variant Selection

## Status

IMPLEMENTED

## Goal

Build Product Detail Page (/products/[slug]) with variant selection, price updates, and SSR metadata.

## Why This Task Exists

Enables customers to inspect product details, select variants (size/color), and inspect stock availability.

## Requirement References

- CT-1
- CT-5
- PRD Section 6.2

## Dependencies

### Blocked By
- TASK-021
- TASK-023
- TASK-024

### Blocks
- TASK-033
- TASK-043

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs SSR product detail rendering and interactive variant selection.
- Installation/activation required: No
- Instructions that apply to this task:
  - Render product details via Server Components
  - Store variant selection in ?variant= URL param

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/products/[slug]/page.tsx`
- `apps/web/src/features/catalog/product-detail.tsx`
- `apps/web/src/features/catalog/variants.ts`

## Current Behavior

Completed. SSR product detail page with variant selector and active variant price updates functional.

## Required Behavior

Selecting variant updates displayed price, SKU, and Add to Cart availability.

## Inputs / Outputs / Contracts

ProductDetailDto with variants array in @shopscale/contracts.

## Implementation Commands

Execute in this order:

1. Build Server Component loading product detail by slug.
2. Build VariantSelector client island synchronizing with ?variant= query param.
3. Add stock availability badges (In Stock, Low Stock, Sold Out).

## Data / Database Changes

None.

## Security Requirements

Enforces store scoping on branded PDP routes (/stores/{slug}/products/{productSlug}).

## Error Handling

Returns 404 on non-existent product slug or unpublished item.

## Edge Cases

- Product has only 1 variant (automatically pre-selects variant)

## Observability

PDP view duration and bounce tracking.

## Tests Required

### Unit
- apps/web/src/features/catalog/variants.test.ts
- apps/web/src/features/catalog/product-detail.test.tsx

### Integration
- Product detail data loader test

### End-to-End
- tests/e2e/product-detail.spec.ts

### Security / Regression
- Assert draft product returns 404 to public shoppers

Do not mark the task complete until required tests pass.

## Manual Verification

Visit /products/running-shoes; switch between size 10 and 11; verify price updates.

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
LOW

Review requirements:
Single review pass. Documented in docs/reviews/t026-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build product detail page with variant selection and stock badges`

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
