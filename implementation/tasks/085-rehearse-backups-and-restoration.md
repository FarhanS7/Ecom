# TASK-085 — Rehearse Backups and Restoration

## Status

COMPLETED

## Goal

Build automated database backup and restore drill scripts, and verify point-in-time recovery and referential integrity against Tier L dataset.

## Why This Task Exists

Proves that disaster recovery procedures are rehearsed and verified, preventing catastrophic data loss.

## Requirement References

- G6
- PRD Section 1.2
- PRD_TO_TASKS_FRAMEWORK Phase 4

## Dependencies

### Blocked By
- TASK-077

### Blocks
- TASK-086
- TASK-087

## Architecture References

- ARCHITECTURE.md -> Operations
- docs/operations/backup-restore.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: ci-cd-and-automation
- Skill: ci-cd-and-automation
- Location: `skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md`
- Why required: Governs backup automation and automated recovery verification scripts.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use pg_dump with custom format (-Fc)
  - Verify row count and FK checksums after restore

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `scripts/backup.sh`
- `scripts/restore.sh`
- `packages/backend/src/db/seed/verify.ts`

## Current Behavior

Not implemented. No automated database backup or restore rehearsal scripts exist.

## Required Behavior

Script 'pnpm db:backup' dumps PostgreSQL database to compressed archive; 'pnpm db:restore' restores to fresh instance; 'pnpm seed:verify' proves 100% data integrity and row count parity.

## Inputs / Outputs / Contracts

CLI commands: pnpm db:backup, pnpm db:restore [archive-path].

## Implementation Commands

Execute in this order:

1. Author scripts/backup.sh using pg_dump with gzip compression and custom directory format.
2. Author scripts/restore.sh using pg_restore with clean database drop and parallel workers.
3. Execute backup against Tier L seeded instance.
4. Drop database and execute restore script.
5. Run pnpm seed:verify asserting zero orphan rows and identical checksums.
6. Document rehearsal duration and recovery steps in docs/operations/backup-restore.md.

## Data / Database Changes

None in schema; exercises full database export and import.

## Security Requirements

Backup files encrypted or stored with strict file system permissions (600).

## Error Handling

Restore script halts immediately if checksum mismatch is detected.

## Edge Cases

- Restoring database while active connections are open (restore script terminates existing connections prior to drop)

## Observability

Backup archive size and restore duration metrics.

## Tests Required

### Unit
- None.

### Integration
- tests/integration/backup-restore.spec.ts (create test database; backup; restore; assert identical table row counts)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Execute 'pnpm db:backup && pnpm db:restore'; verify database tables remain completely intact with seed verification script.

## Definition of Done

- [x] Required skills inspected and activated
- [x] Requirement behavior implemented
- [x] Architecture rules followed
- [x] Security requirements satisfied
- [x] Tests added
- [x] Relevant tests pass
- [x] Lint passes
- [x] Typecheck passes
- [x] Build passes
- [x] Documentation updated where required
- [x] Requirement traceability updated
- [x] Independent review completed according to risk
- [x] No unresolved blocking review findings
- [x] Manual verification completed when required

## Independent Review Requirement

Risk Level:
MEDIUM

Review requirements:
Single thorough review pass focusing on clean database connection termination and checksum verification. Documented in docs/reviews/t085-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(ops): implement automated postgres backup and disaster recovery restore scripts`

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
