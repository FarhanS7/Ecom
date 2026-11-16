# TASK-020 — Implement Seller Catalog Mutations

## Status

IMPLEMENTED

## Goal

Build seller catalog service and endpoints for creating, editing, and publishing products with optimistic concurrency.

## Why This Task Exists

Enables vendors to manage their catalog items safely without race conditions.

## Requirement References

- CT-1
- G4
- PRD Section 5.1

## Dependencies

### Blocked By
- TASK-006
- TASK-018
- TASK-019

### Blocks
- TASK-027
- TASK-028
- TASK-029

## Architecture References

- ARCHITECTURE.md -> Catalog
- DECISIONS.md -> DEC-010

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs versioned mutation contracts and optimistic locking.
- Installation/activation required: No
- Instructions that apply to this task:
  - Require version field on updates
  - Enforce uniform 404 on out-of-scope store ID

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/seller-catalog.service.ts`
- `packages/backend/src/catalog/seller-catalog.controller.ts`

## Current Behavior

Completed. Scoped POST, PATCH, and publication endpoints fully functional; returns uniform 404 on tenant mismatch.

## Required Behavior

Sellers can mutate only their own products; stale version updates return 409 Conflict.

## Inputs / Outputs / Contracts

CreateProductDto, UpdateProductDto, ProductResponseDto in @shopscale/contracts.

## Implementation Commands

Execute in this order:

1. Build SellerCatalogService with scoped store verification.
2. Implement versioned optimistic concurrency checks on product update.
3. Implement ADR-0010: lifecycle transitions (draft -> active) validating active variant existence.

## Data / Database Changes

Inserts and updates products, product_variants, product_publications.

## Security Requirements

Enforces Uniform 404 Rule: modifying a product from another store returns 404 Not Found.

## Error Handling

Returns 409 Conflict on version mismatch; 404 on store mismatch.

## Edge Cases

- Activating product with 0 variants (rejected by ADR-0010 rule)

## Observability

Audit log for product publication and archival.

## Tests Required

### Unit
- packages/backend/src/catalog/seller-catalog.service.test.ts

### Integration
- Seller catalog mutation and concurrency tests

### End-to-End
- tests/e2e/seller-catalog.spec.ts

### Security / Regression
- Assert seller cannot modify product belonging to another store

Do not mark the task complete until required tests pass.

## Manual Verification

Create and update product via curl with seller session; verify version increments.

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
MEDIUM

Review requirements:
Thorough review of optimistic locking and ADR-0010 activation rules. Recorded in docs/reviews/t020-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(catalog): implement seller catalog mutations with optimistic locking`

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
