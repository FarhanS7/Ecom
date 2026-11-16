# TASK-006 — Establish API and Error Conventions

## Status

IMPLEMENTED

## Goal

Implement RFC 7807 problem details exception filter, typed domain errors, and request ID propagation.

## Why This Task Exists

Provides consistent API error responses and end-to-end request tracing across all modules.

## Requirement References

- PRD Section 10
- ARCH-004

## Dependencies

### Blocked By
- TASK-002
- TASK-005

### Blocks
- TASK-008
- TASK-010
- TASK-018
- TASK-020

## Architecture References

- ARCHITECTURE.md -> Error conventions
- docs/architecture/conventions.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Enforces RESTful error contracts and RFC 7807 standards.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use typed error codes
  - Include requestId in every error payload

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/contracts/src/errors.ts`
- `packages/backend/src/platform/http.ts`

## Current Behavior

Completed. Global Fastify error filter converts domain exceptions into RFC 7807 JSON envelopes.

## Required Behavior

All thrown exceptions return { type, title, status, detail, code, requestId }.

## Inputs / Outputs / Contracts

ProblemDetails schema with stable error codes (e.g. NOT_FOUND, VALIDATION_ERROR).

## Implementation Commands

Execute in this order:

1. Define ProblemDetails and DomainError classes in packages/contracts.
2. Implement Fastify GlobalExceptionFilter in packages/backend.
3. Add X-Request-Id header middleware generating or propagating correlation IDs.

## Data / Database Changes

None.

## Security Requirements

Internal stack traces are stripped in production mode to prevent information leakage.

## Error Handling

Catches unhandled exceptions and maps them to generic 500 Internal Server Error.

## Edge Cases

- Malformed JSON request body
- Invalid Content-Type header

## Observability

Logs every 4xx and 5xx error with requestId and actor ID.

## Tests Required

### Unit
- packages/backend/src/platform/http.test.ts

### Integration
- Error formatting integration test

### End-to-End
- None.

### Security / Regression
- Assert stack traces are not leaked in error responses

Do not mark the task complete until required tests pass.

## Manual Verification

Send GET /v1/invalid-route; assert RFC 7807 problem JSON returned with 404.

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
Single review pass. Documented in docs/reviews/t006-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(api): implement rfc 7807 problem details and request id propagation`

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
