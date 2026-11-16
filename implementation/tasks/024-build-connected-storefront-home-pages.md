# TASK-024 — Build Connected Storefront Home Pages

## Status

IMPLEMENTED

## Goal

Build Server-Rendered homepages for marketplace (/) and branded vendor stores (/stores/[slug]).

## Why This Task Exists

Provides primary landing pages displaying featured categories, hero banner, and new arrivals.

## Requirement References

- REQ-STORE-001
- PRD Section 4
- design.md

## Dependencies

### Blocked By
- TASK-016
- TASK-021
- TASK-023

### Blocks
- TASK-025
- TASK-026

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs Next.js SSR data fetching and error boundaries.
- Installation/activation required: No
- Instructions that apply to this task:
  - Render product grids as Server Components
  - Handle missing store content gracefully

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/stores/[slug]/page.tsx`
- `apps/web/src/features/storefront/home.test.tsx`

## Current Behavior

Completed. Server-rendered homepages with store themes, hero banners, and category tiles operational.

## Required Behavior

Marketplace renders global products; store route renders vendor-specific products and branding.

## Inputs / Outputs / Contracts

HomePageProps, StorePageProps.

## Implementation Commands

Execute in this order:

1. Implement marketplace home page in apps/web/src/app/page.tsx.
2. Implement store home page in apps/web/src/app/stores/[slug]/page.tsx.
3. Connect server fetchers to /v1/products and /v1/stores/{slug}.

## Data / Database Changes

None.

## Security Requirements

Public pages are read-only; no customer PII rendered.

## Error Handling

Returns 404 on unknown store slug; shows graceful empty state if store has no products.

## Edge Cases

- Store has zero active products (shows 'Catalog coming soon')

## Observability

Next.js SSR render metrics.

## Tests Required

### Unit
- apps/web/src/features/storefront/home.test.tsx

### Integration
- Storefront data loading tests

### End-to-End
- tests/e2e/storefront-home.spec.ts

### Security / Regression
- Verify suspended store returns 404

Do not mark the task complete until required tests pass.

## Manual Verification

Visit / and /stores/apex-athletics; verify distinct titles and product collections.

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
Single review pass. Documented in docs/reviews/t024-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build server-rendered marketplace and store homepages`

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
