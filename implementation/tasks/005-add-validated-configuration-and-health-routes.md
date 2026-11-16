# TASK-005 — Add Validated Configuration and Health Routes

## Status

IMPLEMENTED

## Goal

Build @shopscale/config package with Zod environment validation and expose unversioned /health/live and /health/ready endpoints.

## Why This Task Exists

Ensures application crashes immediately if environment is invalid and provides container liveness/readiness probes.

## Requirement References

- ARCH-004
- PRD Section 10

## Dependencies

### Blocked By
- TASK-002

### Blocks
- TASK-006
- TASK-008

## Architecture References

- ARCHITECTURE.md -> Configuration
- DECISIONS.md -> DEC-001

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Enforces strict validation of secrets and environment variables at startup.
- Installation/activation required: No
- Instructions that apply to this task:
  - Fail loudly on missing secrets
  - Ensure no secrets leak into logs or client bundles

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/config/src/env.ts`
- `apps/api/src/health/health.controller.ts`

## Current Behavior

Completed. Zod validates process.env at boot; /health/live and /health/ready report DB and Redis status.

## Required Behavior

App aborts boot if DATABASE_URL or JWT_SECRET is missing; health routes report 200 OK when up.

## Inputs / Outputs / Contracts

GET /health/live -> { status: 'ok' }; GET /health/ready -> { status: 'ok', checks: { database: 'up', redis: 'up' } }.

## Implementation Commands

Execute in this order:

1. Implement Zod environment schema in packages/config.
2. Wire config module into NestJS apps/api.
3. Implement HealthController checking database ping and redis ping.

## Data / Database Changes

None.

## Security Requirements

Health endpoints expose no secrets, passwords, or system environment dumps.

## Error Handling

Readiness endpoint returns 503 Service Unavailable if database is unreachable.

## Edge Cases

- Database temporarily down during cold boot

## Observability

Structured health check logging with response time.

## Tests Required

### Unit
- packages/config/src/env.test.ts

### Integration
- apps/api/src/health/health.test.ts

### End-to-End
- None.

### Security / Regression
- Assert health endpoint does not leak secrets

Do not mark the task complete until required tests pass.

## Manual Verification

Curl http://localhost:3001/health/ready; assert 200 OK with database: 'up'.

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
Single review pass. Documented in docs/reviews/t005-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(platform): add validated configuration and health endpoints`

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
