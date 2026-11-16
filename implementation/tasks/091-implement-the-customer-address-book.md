# TASK-091 — Implement the Customer Address Book

## Status

IMPLEMENTED

## Goal

Build addresses table, address validation, CRUD endpoints, and Next.js customer address management UI.

## Why This Task Exists

Allows shoppers to save delivery addresses; provides address snapshots for checkout.

## Requirement References

- REQ-STORE-004
- PRD Section 8

## Dependencies

### Blocked By
- TASK-003
- TASK-009

### Blocks
- TASK-047
- TASK-055

## Architecture References

- ARCHITECTURE.md -> Identity and stores
- docs/architecture/data-model.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs address DTOs and customer resource scoping.
- Installation/activation required: No
- Instructions that apply to this task:
  - Scope addresses strictly to user_id
  - Validate structured fields

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `db/migrations/0005-addresses.sql`
- `packages/backend/src/identity/address.service.ts`
- `apps/web/src/features/account/address-book.tsx`

## Current Behavior

Completed. 0005-addresses.sql applied; customer address CRUD functional; checkout snapshots deferred to T047.

## Required Behavior

Customers can create, edit, list, and delete saved shipping addresses; cannot see other users' addresses.

## Inputs / Outputs / Contracts

AddressDto, CreateAddressDto in @shopscale/contracts.

## Implementation Commands

Execute in this order:

1. Author migration 0005-addresses.sql creating addresses table.
2. Build AddressService with scoped CRUD operations.
3. Build Next.js address book component on /account/addresses.

## Data / Database Changes

Creates addresses(id, user_id, fields JSONB, created_at).

## Security Requirements

Enforces ownership checks: user can access only their own address records.

## Error Handling

Returns 404 Not Found if address ID does not belong to authenticated user.

## Edge Cases

- Deleting an address currently referenced by an active order (immutable order snapshots prevent issues)

## Observability

Audit log for address creation and deletion.

## Tests Required

### Unit
- packages/backend/src/identity/address.service.test.ts

### Integration
- Customer address ownership test

### End-to-End
- tests/e2e/addresses.spec.ts

### Security / Regression
- Assert user cannot read or update another user's address ID

Do not mark the task complete until required tests pass.

## Manual Verification

Add new address in /account; verify address displays in list and persists across reloads.

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
Single review pass. Documented in docs/reviews/t091-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(identity): implement customer address book and account management ui`

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
