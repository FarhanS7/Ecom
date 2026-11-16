# TASK-021 — Implement Channel-Aware Catalog Reads

## Status

IMPLEMENTED

## Goal

Build public catalog read endpoints filtering products by channel publication flags and active status.

## Why This Task Exists

Ensures shoppers view only active, published products appropriate to their browsing channel.

## Requirement References

- CT-2
- REQ-STORE-001
- PRD Section 6.2

## Dependencies

### Blocked By
- TASK-019
- TASK-016

### Blocks
- TASK-024
- TASK-025
- TASK-026

## Architecture References

- ARCHITECTURE.md -> Catalog
- DECISIONS.md -> DEC-003

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs public read contracts and channel scoping.
- Installation/activation required: No
- Instructions that apply to this task:
  - Filter by products.status = 'active'
  - Respect channel publication flags

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/read.service.ts`
- `packages/backend/src/catalog/catalog.controller.ts`

## Current Behavior

Completed. GET /v1/products and GET /v1/stores/{slug}/products filter by channel visibility.

## Required Behavior

Marketplace reads require marketplace_enabled=true; store reads require store_enabled=true and active status.

## Inputs / Outputs / Contracts

PublicProductDto, CatalogListResponseDto.

## Implementation Commands

Execute in this order:

1. Build CatalogReadService enforcing VISIBILITY_WHERE clause.
2. Expose marketplace listing and store-scoped catalog routes.
3. Ensure min_price_cents is serialized as decimal string.

## Data / Database Changes

None.

## Security Requirements

Draft, archived, or unpublished products are completely hidden from public queries.

## Error Handling

Returns 404 Not Found if store slug or product slug does not exist.

## Edge Cases

- Store suspended by admin (must hide all store products immediately)

## Observability

Structured read latency logs.

## Tests Required

### Unit
- packages/backend/src/catalog/read.service.test.ts

### Integration
- Channel-filtered catalog read integration tests

### End-to-End
- tests/e2e/product-list.spec.ts

### Security / Regression
- Assert draft product is never returned in public catalog query

Do not mark the task complete until required tests pass.

## Manual Verification

Fetch /v1/products; verify only active products with marketplace_enabled=true appear.

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
Single review pass. Documented in docs/reviews/t021-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(catalog): implement channel-aware public catalog read endpoints`

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
