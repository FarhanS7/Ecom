# TASK-012 — Implement Account Recovery and Verification

## Status

IMPLEMENTED

## Goal

Build email verification and password reset flows using single-use hash tokens and expiration TTLs.

## Why This Task Exists

Enables customers to securely recover accounts and verify email ownership.

## Requirement References

- ID-1
- ID-2
- PRD Section 6.1

## Dependencies

### Blocked By
- TASK-009
- TASK-010

### Blocks
- TASK-017

## Architecture References

- ARCHITECTURE.md -> Authentication
- DECISIONS.md -> DEC-004

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs cryptographic token generation and timing-safe consumption.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use crypto.randomBytes(32)
  - Store only SHA-256 hash in DB

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/identity/recovery.service.ts`
- `packages/backend/src/identity/identity-token.ts`

## Current Behavior

Completed. Endpoints for /password-reset/request, /password-reset/confirm, and /verify-email fully operational.

## Required Behavior

Generates 1-hour reset token; confirms new password; marks email verified upon token match.

## Inputs / Outputs / Contracts

PasswordResetRequestDto, PasswordResetConfirmDto, VerifyEmailDto.

## Implementation Commands

Execute in this order:

1. Implement IdentityTokenService generating secure random 32-byte tokens.
2. Build RecoveryService handling request and confirmation with Argon2id update.
3. Add email verification endpoint marking users.status = 'ACTIVE'.

## Data / Database Changes

Inserts identity_tokens; updates users (password_hash, status).

## Security Requirements

Reset tokens expire after 60 minutes and can be used exactly once.

## Error Handling

Returns 400 Bad Request on expired or already-consumed recovery tokens.

## Edge Cases

- Password reset requested for non-existent email (must return 200 to prevent user enumeration)

## Observability

Audit log for every password change and verification.

## Tests Required

### Unit
- packages/backend/src/identity/recovery.service.test.ts

### Integration
- Account recovery lifecycle test

### End-to-End
- tests/e2e/account.spec.ts

### Security / Regression
- User enumeration prevention test on reset request endpoint

Do not mark the task complete until required tests pass.

## Manual Verification

Request password reset; copy token hash; confirm new password and login with new credentials.

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
Thorough independent review of user enumeration defenses. Documented in docs/reviews/t012-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(identity): implement password reset and email verification flows`

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
