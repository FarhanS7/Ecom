# TASK-011 — Implement Refresh Rotation and Logout

## Status

IMPLEMENTED

## Goal

Build refresh token rotation with reuse detection, session family revocation, and logout invalidation.

## Why This Task Exists

Prevents stolen refresh tokens from gaining persistent access while maintaining long-lived user sessions.

## Requirement References

- ID-1
- ID-3
- G4
- PRD Section 6.1

## Dependencies

### Blocked By
- TASK-010

### Blocks
- TASK-013
- TASK-017
- TASK-018

## Architecture References

- ARCHITECTURE.md -> Authentication
- DECISIONS.md -> DEC-004

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Enforces token family reuse detection protocols.
- Installation/activation required: No
- Instructions that apply to this task:
  - Revoke entire family on reuse
  - Hash tokens prior to DB lookup

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/identity/session.service.ts`
- `packages/backend/src/identity/session.guard.ts`

## Current Behavior

Completed. POST /v1/auth/refresh rotates token; replayed token revokes session family; POST /v1/auth/logout invalidates session.

## Required Behavior

Refreshing token updates used_at and issues new token; presenting consumed token revokes all sibling tokens.

## Inputs / Outputs / Contracts

POST /v1/auth/refresh -> 200 OK + new cookies; POST /v1/auth/logout -> 200 OK + cleared cookies.

## Implementation Commands

Execute in this order:

1. Implement SessionService.rotateToken() with atomic Drizzle transaction.
2. Add reuse detection check revoking family if used_at is not null.
3. Implement SessionService.revoke() for logout.

## Data / Database Changes

Updates refresh_tokens (used_at, replacement_id) and session_families (revoked_at).

## Security Requirements

Reused refresh token immediately neutralizes compromised session family.

## Error Handling

Returns 401 Unauthorized with code REFRESH_TOKEN_REUSED upon reuse.

## Edge Cases

- Concurrent refresh requests from multiple browser tabs

## Observability

Security alert logged on token reuse detection.

## Tests Required

### Unit
- packages/backend/src/identity/session.service.test.ts

### Integration
- Token rotation and reuse revocation integration test

### End-to-End
- tests/e2e/account.spec.ts

### Security / Regression
- Simulated token theft and replay test asserting total family revocation

Do not mark the task complete until required tests pass.

## Manual Verification

Exchange refresh token twice; assert second call returns 401 and invalidates active session.

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
Multiple review passes on concurrent rotation races. Documented in docs/reviews/t011-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(identity): implement refresh token rotation and reuse revocation`

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
