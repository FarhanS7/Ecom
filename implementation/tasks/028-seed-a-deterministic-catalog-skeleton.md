# TASK-028 — Seed a Deterministic Catalog Skeleton

## Status

IMPLEMENTED

## Goal

Build deterministic seed script populating Tier S and Tier M catalog fixtures with realistic distributions.

## Why This Task Exists

Provides repeatable, referentially valid data for automated integration tests and local demos.

## Requirement References

- PRD Section 11
- ARCH-003

## Dependencies

### Blocked By
- TASK-019
- TASK-020
- TASK-027

### Blocks
- TASK-029
- TASK-030
- TASK-077

## Architecture References

- ARCHITECTURE.md -> Database
- DECISIONS.md -> DEC-009

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Ensures seed generator is deterministic and referentially valid.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use seeded PRNG (seed=42)
  - Validate FK integrity on exit

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/db/seed.ts`
- `packages/backend/src/db/seed/catalog.ts`
- `packages/backend/src/db/seed/verify.ts`

## Current Behavior

Completed. pnpm seed --size s generates deterministic products, stores, users, and themes with checksum verification.

## Required Behavior

Running seed with identical SEED=42 yields identical database state and checksums.

## Inputs / Outputs / Contracts

SeedOptions: { size: 's' | 'm' | 'l', seed: number }.

## Implementation Commands

Execute in this order:

1. Implement deterministic pseudo-random generator in packages/backend/src/db/seed/random.ts.
2. Build catalog fixture generators with power-law popularity and realistic price bands.
3. Add seed verification script asserting row counts and foreign key integrity.

## Data / Database Changes

Inserts users, stores, categories, products, product_variants, store_themes.

## Security Requirements

Fixed demo account passwords documented for local use only.

## Error Handling

Seed script fails loudly if foreign key constraint is violated.

## Edge Cases

- Re-running seed on dirty database (must truncate or clean tables first)

## Observability

Seed execution summary showing row counts and duration.

## Tests Required

### Unit
- packages/backend/src/db/seed.test.ts
- packages/backend/src/db/seed/verify.test.ts

### Integration
- Live PostgreSQL seed run and checksum verification

### End-to-End
- None.

### Security / Regression
- Assert demo accounts have distinct UUIDs and hashed passwords

Do not mark the task complete until required tests pass.

## Manual Verification

Run pnpm seed --size s --seed 42; verify terminal prints verified counts.

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
Single review pass. Documented in docs/reviews/t028-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(db): build deterministic catalog seed script and verification harness`

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
