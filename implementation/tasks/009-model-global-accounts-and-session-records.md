# TASK-009 — Model Global Accounts and Session Records

## Status

IMPLEMENTED

## Goal

Author Drizzle schema and migrations for users, platform_roles, permissions, session_families, and refresh_tokens.

## Why This Task Exists

Provides normalized global customer identity and stateful session tracking for token rotation.

## Requirement References

- ID-1
- ID-3
- G4
- PRD Section 8

## Dependencies

### Blocked By
- TASK-003
- TASK-008

### Blocks
- TASK-010
- TASK-011
- TASK-012
- TASK-014
- TASK-091

## Architecture References

- ARCHITECTURE.md -> Authentication
- DECISIONS.md -> DEC-004

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: domain-modeling
- Skill: domain-modeling
- Location: `skills/skills-main/skills/engineering/domain-modeling/SKILL.md`
- Why required: Governs designing normalized identity tables and relationship constraints.
- Installation/activation required: No
- Instructions that apply to this task:
  - Normalize emails on write
  - Hash all stored tokens

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/identity/schema.ts`
- `db/migrations/0001-identity.sql`

## Current Behavior

Completed. 0001-identity.sql applied with unique email constraints, session families, and token hash indexes.

## Required Behavior

PostgreSQL schema enforces unique normalized emails and parent session family cascade rules.

## Inputs / Outputs / Contracts

Users, SessionFamilies, RefreshTokens Drizzle schema definitions.

## Implementation Commands

Execute in this order:

1. Define Drizzle schema for identity tables in packages/backend/src/identity/schema.ts.
2. Generate migration 0001-identity.sql with indexes on user_id and token_hash.
3. Apply migration and verify schema constraints in integration tests.

## Data / Database Changes

Creates users, platform_roles, permissions, role_permissions, user_platform_roles, session_families, refresh_tokens, identity_tokens.

## Security Requirements

Raw tokens and plaintext passwords are never stored in the database.

## Error Handling

Unique constraint violations on email throw typed DuplicateEmailError.

## Edge Cases

- Case insensitivity in email addresses
- Null replacement token on fresh session

## Observability

Migration log confirmation.

## Tests Required

### Unit
- packages/backend/src/identity/schema.test.ts

### Integration
- Identity schema constraint tests against PostgreSQL

### End-to-End
- None.

### Security / Regression
- Assert token_hash column stores SHA-256 digests

Do not mark the task complete until required tests pass.

## Manual Verification

Inspect PostgreSQL tables via psql: \d users; verify unique email constraint exists.

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
Multiple review passes on security and session lifetime rules. Recorded in docs/reviews/t009-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(identity): model global accounts and session families in postgres`

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
