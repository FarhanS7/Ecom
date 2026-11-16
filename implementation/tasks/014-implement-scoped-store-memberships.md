# TASK-014 — Implement Scoped Store Memberships

## Status

IMPLEMENTED

## Goal

Model businesses, stores, store_roles, and store_memberships with fine-grained staff permissions.

## Why This Task Exists

Enforces multi-tenancy, vendor boundaries, and staff role separation.

## Requirement References

- G4
- ID-5
- PRD Section 5.1
- REQ-STORE-002

## Dependencies

### Blocked By
- TASK-003
- TASK-009

### Blocks
- TASK-015
- TASK-016
- TASK-018
- TASK-020

## Architecture References

- ARCHITECTURE.md -> Boundaries
- DECISIONS.md -> DEC-003

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: domain-modeling
- Skill: domain-modeling
- Location: `skills/skills-main/skills/engineering/domain-modeling/SKILL.md`
- Why required: Governs multi-tenant relational modeling and composite keys.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use composite PK (store_id, user_id)
  - Enforce store_id on all child tables

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/stores/schema.ts`
- `db/migrations/0002-stores.sql`
- `packages/backend/src/stores/permissions.ts`

## Current Behavior

Completed. 0002-stores.sql applied; store_memberships links users to stores with owner, manager, catalog-editor, fulfillment roles.

## Required Behavior

Staff access is scoped by (user_id, store_id); users can hold distinct roles across different stores.

## Inputs / Outputs / Contracts

Businesses, Stores, StoreMemberships, StoreRoles Drizzle schemas.

## Implementation Commands

Execute in this order:

1. Define stores domain schema in packages/backend/src/stores/schema.ts.
2. Author migration 0002-stores.sql with composite foreign keys.
3. Implement PermissionEvaluator resolving store-specific capabilities.

## Data / Database Changes

Creates businesses, stores, store_roles, store_role_permissions, store_memberships.

## Security Requirements

Enforces tenant isolation; users cannot access stores without valid membership.

## Error Handling

Cross-store requests fail with uniform 404 Not Found.

## Edge Cases

- User holds membership in multiple stores simultaneously

## Observability

Audit trail for store membership updates.

## Tests Required

### Unit
- packages/backend/src/stores/permissions.test.ts

### Integration
- Multi-tenant membership constraint tests

### End-to-End
- None.

### Security / Regression
- Verify store membership cannot be forged via request body

Do not mark the task complete until required tests pass.

## Manual Verification

Query store_memberships table; verify owner role assigned to test vendor.

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
HIGH

Review requirements:
Multiple review passes on multi-tenant isolation. Recorded in docs/reviews/t014-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(stores): model businesses stores and scoped staff memberships`

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
