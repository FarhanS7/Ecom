# TASK-027 — Build Seller Catalog Editing Screens

## Status

IMPLEMENTED

## Goal

Build Next.js seller console for creating products, editing variants, and managing channel publication.

## Why This Task Exists

Provides merchants with intuitive management interface enforcing ADR-0010 validation rules.

## Requirement References

- CT-1
- G4
- PRD Section 5.1

## Dependencies

### Blocked By
- TASK-020
- TASK-023

### Blocks
- TASK-028
- TASK-036
- TASK-040

## Architecture References

- ARCHITECTURE.md -> Frontend
- DECISIONS.md -> DEC-010

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs Next.js Server Actions and complex form workspaces.
- Installation/activation required: No
- Instructions that apply to this task:
  - Validate via Server Actions using shared contracts
  - Handle 409 version conflicts gracefully

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/seller/products/page.tsx`
- `apps/web/src/features/seller/product-workspace.tsx`
- `apps/web/src/features/seller/actions.ts`

## Current Behavior

Completed. Seller product editor supports variant table, draft-active toggle, and server action validation.

## Required Behavior

Sellers can author products and variants; server actions validate against Zod schemas; 409 triggers reload option.

## Inputs / Outputs / Contracts

Seller product workspace props and Server Action schemas.

## Implementation Commands

Execute in this order:

1. Build Seller ProductWorkspace component with tabs for Details, Variants, and Publication.
2. Implement Next.js Server Actions validating payloads before forwarding to API.
3. Build optimistic concurrency conflict handler offering 'reload latest' prompt.

## Data / Database Changes

None.

## Security Requirements

Seller write routes stay off public gateway allowlist; called server-to-server.

## Error Handling

Displays inline field errors returned by Server Actions.

## Edge Cases

- Concurrent edits by two managers in the same store (handled via 409 flow)

## Observability

Seller product mutation audit log.

## Tests Required

### Unit
- apps/web/src/features/seller/actions.test.ts
- apps/web/src/features/seller/validation.test.ts

### Integration
- Seller workspace server action integration test

### End-to-End
- tests/e2e/seller-catalog.spec.ts

### Security / Regression
- Assert non-seller cannot access /seller routes

Do not mark the task complete until required tests pass.

## Manual Verification

Create product in /seller/products; add variant; toggle active; verify product publishes.

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
Thorough review of ADR-0010 validation boundary. Documented in docs/reviews/t027-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build seller catalog editing screens with variant management`

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
