# TASK-018 — Build the Authorization Matrix Harness

## Status

IMPLEMENTED

## Goal

Build automated test suite exercising every API endpoint across all roles and stores to verify allow/deny rules.

## Why This Task Exists

Provides mechanical proof that RBAC and ABAC tenant isolation rules are completely enforced across the API.

## Requirement References

- G4
- PRD Section 5.1
- PRD Section 5.2

## Dependencies

### Blocked By
- TASK-006
- TASK-010
- TASK-011
- TASK-013
- TASK-014
- TASK-015

### Blocks
- TASK-020
- TASK-074

## Architecture References

- ARCHITECTURE.md -> Authorization
- docs/architecture/conventions.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs automated authorization testing and route permission audits.
- Installation/activation required: No
- Instructions that apply to this task:
  - Iterate every declared route
  - Assert exact allow/deny expectations

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/stores/permissions.test.ts`
- `packages/backend/src/platform/security.test.ts`

## Current Behavior

Completed. Test harness verifies route x role combinations; catches OpenAPI drift and missing guards.

## Required Behavior

Fails CI if any endpoint lacks an explicit permission declaration or permits cross-tenant access.

## Inputs / Outputs / Contracts

PermissionMatrix definition in test harness.

## Implementation Commands

Execute in this order:

1. Build test harness scanning Fastify route table.
2. Execute each route against fixtures for Guest, Customer, Seller1, Seller2, Support, Admin.
3. Assert 401 on unauthenticated, 403 on role mismatch, and uniform 404 on cross-store access.

## Data / Database Changes

None.

## Security Requirements

Enforces deny-by-default on all endpoints.

## Error Handling

Harness prints exact route and failing role combination on test failure.

## Edge Cases

- Routes with optional authentication parameters

## Observability

Matrix coverage report in CI logs.

## Tests Required

### Unit
- packages/backend/src/stores/permissions.test.ts

### Integration
- Full route permission matrix evaluation

### End-to-End
- None.

### Security / Regression
- Assert cross-store access unconditionally returns 404

Do not mark the task complete until required tests pass.

## Manual Verification

Run pnpm test permissions; assert 100% matrix scenarios pass.

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
Multiple review passes on authorization coverage. Documented in docs/reviews/t018-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(security): build automated route and role authorization matrix harness`

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
