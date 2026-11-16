# TASK-003 — Create the Database Migration Harness

## Status

IMPLEMENTED

## Goal

Set up Drizzle ORM migration runner and schema harness supporting sequential SQL migrations against PostgreSQL.

## Why This Task Exists

Ensures reproducible database setup and reviewable additive migrations.

## Requirement References

- ARCH-003
- PRD Section 8

## Dependencies

### Blocked By
- TASK-002
- TASK-004

### Blocks
- TASK-008
- TASK-009
- TASK-019
- TASK-029
- TASK-037

## Architecture References

- ARCHITECTURE.md -> Database Schema
- DECISIONS.md -> DEC-002

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Ensures migration scripts run clean in integration tests.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test migrations against real PostgreSQL
  - Assert rollback safety

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `db/drizzle.config.ts`
- `packages/backend/src/platform/database.ts`
- `db/migrations/0000-bootstrap.sql`

## Current Behavior

Completed. Drizzle migration runner executes SQL files from db/migrations/ with migration lock.

## Required Behavior

pnpm db:migrate runs cleanly against fresh PostgreSQL instance.

## Inputs / Outputs / Contracts

node-postgres Pool connection and Drizzle client port.

## Implementation Commands

Execute in this order:

1. Configure db/drizzle.config.ts and database connection pool.
2. Create 0000-bootstrap.sql enabling pgcrypto and pg_trgm extensions.
3. Write migration runner script in packages/backend/src/db/migrate.ts.

## Data / Database Changes

Creates schema migrations lock table and initial extensions.

## Security Requirements

Database credentials strictly read from validated environment variables.

## Error Handling

Throws typed MigrationError on SQL failure and aborts transaction.

## Edge Cases

- Concurrent migration runs
- Out-of-order migration filenames

## Observability

Migration execution logs detailing applied SQL files and timestamps.

## Tests Required

### Unit
- packages/backend/src/platform/database.test.ts

### Integration
- Migration bootstrap test against live PostgreSQL

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Run pnpm db:migrate against PostgreSQL container; verify tables and extensions created.

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
Thorough independent review of migration locking. Recorded in docs/reviews/t003-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(db): create drizzle migration harness and bootstrap migration`

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
