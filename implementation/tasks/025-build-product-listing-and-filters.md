# TASK-025 — Build Product Listing and Filters

## Status

IMPLEMENTED

## Goal

Build Product Listing Page (/products) with category navigation, sort controls, and URL-driven filter panel.

## Why This Task Exists

Enables shoppers to discover, filter, and paginate through catalog items.

## Requirement References

- CT-2
- PRD Section 6.2

## Dependencies

### Blocked By
- TASK-021
- TASK-022
- TASK-023
- TASK-024

### Blocks
- TASK-032
- TASK-043

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs URL query state synchronization and client component islands.
- Installation/activation required: No
- Instructions that apply to this task:
  - Keep URL as single source of truth for filters
  - Debounce filter changes

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/products/page.tsx`
- `apps/web/src/features/catalog/product-list.tsx`
- `apps/web/src/features/catalog/query-state.ts`

## Current Behavior

Completed. URL-driven filter panel, sort dropdown, and keyset cursor pagination functional.

## Required Behavior

Filters synchronize with URL search params; back/forward navigation preserves active filters.

## Inputs / Outputs / Contracts

CatalogQueryParams schema and ProductListProps.

## Implementation Commands

Execute in this order:

1. Implement query-state manager parsing and updating URL search params.
2. Build FilterPanel client island with category tree and price slider.
3. Build ProductGrid component rendering responsive product cards.

## Data / Database Changes

None.

## Security Requirements

Sanitizes URL query parameters; prevents script injection via search queries.

## Error Handling

Displays empty search results banner with clear-filters button when no items match.

## Edge Cases

- Min price greater than max price (automatically swaps or clamps values)

## Observability

Filter interaction analytics events.

## Tests Required

### Unit
- apps/web/src/features/catalog/query-state.test.ts
- apps/web/src/features/catalog/product-list.test.tsx

### Integration
- Filter and sort parameter composition test

### End-to-End
- tests/e2e/product-list.spec.ts

### Security / Regression
- Assert malicious query params do not cause SSR crash or XSS

Do not mark the task complete until required tests pass.

## Manual Verification

Filter by price and category; reload page; verify active filters remain intact.

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
Single review pass. Documented in docs/reviews/t025-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build product listing page with url-driven filter panel`

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
