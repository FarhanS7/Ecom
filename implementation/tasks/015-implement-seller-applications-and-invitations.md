# TASK-015 — Implement Seller Applications and Invitations

## Status

IMPLEMENTED

## Goal

Build seller onboarding application endpoints, admin approval transitions, and staff email invitation workflows.

## Why This Task Exists

Enables new merchants to register and store owners to invite teammates.

## Requirement References

- ID-5
- PRD Section 6.1

## Dependencies

### Blocked By
- TASK-014

### Blocks
- TASK-018
- TASK-068
- TASK-069

## Architecture References

- ARCHITECTURE.md -> Identity and Stores
- docs/modules/stores.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs lifecycle states and onboarding API contracts.
- Installation/activation required: No
- Instructions that apply to this task:
  - Enforce admin-only approval
  - Hash invitation tokens

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/stores/store.service.ts`
- `packages/backend/src/stores/invitation.service.ts`

## Current Behavior

Completed. Endpoints for seller application, admin approval, and staff invitations fully tested.

## Required Behavior

Sellers submit application in pending status; admin approves, transitioning store to ACTIVE; staff receive token invite.

## Inputs / Outputs / Contracts

SellerApplicationDto, StoreInvitationDto, StoreApprovalDto.

## Implementation Commands

Execute in this order:

1. Build StoreService.applyForStore() inserting pending business and store.
2. Build StoreService.approveStore() restricted to admin role.
3. Build InvitationService.createInvitation() generating hashed invite token.

## Data / Database Changes

Inserts store_invitations, updates stores.status.

## Security Requirements

Store approval restricted strictly to platform administrators.

## Error Handling

Returns 409 Conflict if shop name or slug already exists.

## Edge Cases

- Inviting an email that already has membership in the store

## Observability

Audit log for seller application approval.

## Tests Required

### Unit
- packages/backend/src/stores/store.service.test.ts

### Integration
- Seller onboarding and invitation lifecycle test

### End-to-End
- None.

### Security / Regression
- Verify non-admin cannot approve seller applications

Do not mark the task complete until required tests pass.

## Manual Verification

Submit seller application; approve as admin; verify store status transitions to ACTIVE.

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
Single thorough review pass. Documented in docs/reviews/t015-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(stores): implement seller application approval and staff invitations`

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
