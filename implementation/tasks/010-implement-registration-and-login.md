# TASK-010 — Implement Registration and Login

## Status

IMPLEMENTED

## Goal

Build AuthService with Argon2id password hashing, credential verification, and initial session issuance.

## Why This Task Exists

Provides secure entry point for customer and seller authentication.

## Requirement References

- ID-1
- G4
- PRD Section 6.1

## Dependencies

### Blocked By
- TASK-006
- TASK-009

### Blocks
- TASK-011
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
- Why required: Governs Argon2id implementation and secure credential handling.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use memoryCost 64MB and timeCost 3
  - Enforce timing-safe comparisons

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/identity/auth.service.ts`
- `packages/backend/src/identity/auth.controller.ts`

## Current Behavior

Completed. POST /v1/auth/register and /v1/auth/login validate credentials and issue HttpOnly session cookies.

## Required Behavior

Valid credentials issue JWT and refresh token; invalid credentials return 401 with generic message.

## Inputs / Outputs / Contracts

RegisterDto, LoginDto, SessionResponse DTOs in @shopscale/contracts.

## Implementation Commands

Execute in this order:

1. Implement Argon2id hashing in packages/backend/src/identity/password.ts.
2. Build AuthService.register() and AuthService.login() methods.
3. Expose Fastify controller endpoints setting shopscale_session cookie.

## Data / Database Changes

Inserts users, session_families, refresh_tokens.

## Security Requirements

Password hashing uses Argon2id; timing attack prevention on invalid user emails.

## Error Handling

Returns 401 Invalid Credentials on wrong password; 409 Conflict on existing email.

## Edge Cases

- Whitespace trimming in emails
- Unicode password characters

## Observability

Structured audit log of successful and failed login attempts.

## Tests Required

### Unit
- packages/backend/src/identity/auth.service.test.ts

### Integration
- Authentication flow integration test with live PostgreSQL

### End-to-End
- tests/e2e/account.spec.ts

### Security / Regression
- Timing attack resistance verification

Do not mark the task complete until required tests pass.

## Manual Verification

Register test account via curl; login and verify Set-Cookie header contains HttpOnly session token.

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
Multiple review passes on password security and cookie flags. Documented in docs/reviews/t010-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(identity): implement registration and login with argon2id hashing`

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
