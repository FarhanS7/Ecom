# TASK-017 — Build Account and Recovery Screens

## Status

IMPLEMENTED

## Goal

Build Next.js pages for /login, /register, /forgot-password, /reset-password, and /account dashboard.

## Why This Task Exists

Provides complete presentation interface for authentication and customer self-service.

## Requirement References

- ID-1
- ID-2
- PRD Section 6.1

## Dependencies

### Blocked By
- TASK-007
- TASK-010
- TASK-011
- TASK-012
- TASK-016

### Blocks
- TASK-024

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs accessible form controls and client-side validation.
- Installation/activation required: No
- Instructions that apply to this task:
  - Include accessible form labels
  - Show clear field error states

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/register/page.tsx`
- `apps/web/src/app/account/page.tsx`

## Current Behavior

Completed. Fully accessible auth screens wired to same-origin API proxy with form validation.

## Required Behavior

Users can log in, register, reset password, and view account details through clean Next.js UI.

## Inputs / Outputs / Contracts

Auth form actions and session user context.

## Implementation Commands

Execute in this order:

1. Build login and registration form components with inline validation.
2. Build forgot-password and reset-password token confirmation pages.
3. Build account profile dashboard displaying user info and active sessions.

## Data / Database Changes

None.

## Security Requirements

Forms use CSRF tokens and submit via POST; passwords masked in input fields.

## Error Handling

Displays inline field errors for invalid input; banners for rate limiting.

## Edge Cases

- Submitting form multiple times before response arrives (disable button on submit)

## Observability

Client-side telemetry on authentication failure.

## Tests Required

### Unit
- apps/web/src/features/auth/login-form.test.tsx

### Integration
- apps/web/src/lib/session.test.ts

### End-to-End
- tests/e2e/account.spec.ts

### Security / Regression
- Assert password is not logged or visible in DOM

Do not mark the task complete until required tests pass.

## Manual Verification

Complete full registration and login in browser; verify account page renders user email.

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
Single review pass. Documented in docs/reviews/t017-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build authentication and account management pages`

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
