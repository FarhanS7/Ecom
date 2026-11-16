# TASK-013 — Add Authentication Throttling and Protections

## Status

IMPLEMENTED

## Goal

Build Redis sliding-window rate limiters on login, registration, and password recovery endpoints.

## Why This Task Exists

Protects authentication routes against brute-force password guessing and credential stuffing attacks.

## Requirement References

- ID-4
- G4
- PRD Section 5.3

## Dependencies

### Blocked By
- TASK-010
- TASK-011

### Blocks
- TASK-018

## Architecture References

- ARCHITECTURE.md -> Rate Limiting
- DECISIONS.md -> DEC-004

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs brute-force defenses and rate limiting algorithms.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use Redis sliding window
  - Return Retry-After headers on breach

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/identity/rate-limit.ts`
- `packages/backend/src/identity/auth-throttle.guard.ts`

## Current Behavior

Completed. Redis token bucket limits failed logins to 5 per 15 minutes per IP and email.

## Required Behavior

Breaching limit returns HTTP 429 Too Many Requests with Retry-After header.

## Inputs / Outputs / Contracts

HTTP 429 response with Retry-After header and RATE_LIMITED code.

## Implementation Commands

Execute in this order:

1. Implement Redis sliding window counter in packages/backend/src/identity/rate-limit.ts.
2. Build AuthThrottleGuard intercepting login and password reset routes.
3. Add test fixtures verifying threshold trigger and automatic expiry.

## Data / Database Changes

Stores ephemeral keys in Redis DB 1 (rl:login:{ip}, rl:login:{email}).

## Security Requirements

Mitigates credential stuffing across distributed IP proxies.

## Error Handling

Returns 429 with precise retry seconds remaining.

## Edge Cases

- X-Forwarded-For header spoofing (must use trusted proxy config)

## Observability

Warn log emitted on every rate limit breach.

## Tests Required

### Unit
- packages/backend/src/identity/rate-limit.test.ts

### Integration
- Brute force throttle integration test with live Redis

### End-to-End
- None.

### Security / Regression
- Verify rate limit cannot be bypassed with spoofed client headers

Do not mark the task complete until required tests pass.

## Manual Verification

Submit 5 invalid logins rapidly; assert 6th request fails with HTTP 429 and Retry-After.

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
Single thorough review pass. Documented in docs/reviews/t013-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(identity): add redis sliding-window brute-force rate limiting`

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
