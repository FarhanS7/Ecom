# TASK-019 — Model Products and Variants

## Status

IMPLEMENTED

## Goal

Author Drizzle schema and migrations for categories, products, product_variants, and product_publications.

## Why This Task Exists

Provides relational foundation for catalog management, multi-variant products, and channel publication flags.

## Requirement References

- CT-1
- PRD Section 8

## Dependencies

### Blocked By
- TASK-003
- TASK-014

### Blocks
- TASK-020
- TASK-021
- TASK-022
- TASK-028
- TASK-037

## Architecture References

- ARCHITECTURE.md -> Catalog
- DECISIONS.md -> DEC-010

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: domain-modeling
- Skill: domain-modeling
- Location: `skills/skills-main/skills/engineering/domain-modeling/SKILL.md`
- Why required: Governs designing product variants and composite store keys.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use composite FK (store_id, product_id)
  - Store prices as integer cents

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/schema.ts`
- `db/migrations/0006-catalog.sql`

## Current Behavior

Completed. 0006-catalog.sql applied; products, variants, categories, and publication tables active.

## Required Behavior

Enforces UNIQUE(store_id, slug), UNIQUE(store_id, sku), and min_price_cents derivation.

## Inputs / Outputs / Contracts

Products, ProductVariants, Categories Drizzle schemas in @shopscale/backend.

## Implementation Commands

Execute in this order:

1. Define catalog domain schema in packages/backend/src/catalog/schema.ts.
2. Author migration 0006-catalog.sql with composite keys and indexes.
3. Add category tree cycle prevention and path validation.

## Data / Database Changes

Creates categories, products, product_variants, product_publications.

## Security Requirements

Enforces store ownership: variants cannot reference products belonging to another store.

## Error Handling

Unique constraint violations on SKU or slug throw typed DuplicateSlugError / DuplicateSkuError.

## Edge Cases

- Product with zero active variants
- Category parent self-reference cycle

## Observability

Migration log confirmation.

## Tests Required

### Unit
- packages/backend/src/catalog/schema.test.ts

### Integration
- Catalog schema constraint tests against live PostgreSQL

### End-to-End
- None.

### Security / Regression
- Verify cross-store product-variant association is rejected by foreign key

Do not mark the task complete until required tests pass.

## Manual Verification

Inspect PostgreSQL tables: \d products; verify foreign keys and constraints.

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
Single thorough review pass. Documented in docs/reviews/t019-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(catalog): model categories products variants and publications`

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
