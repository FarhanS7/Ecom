# TASK-004 — Define the Minimal Docker Profile

## Status

IMPLEMENTED

## Goal

Create compose.yml defining lightweight containers for PostgreSQL 16 and Redis 7.

## Why This Task Exists

Provides deterministic local dependencies without exhausting host RAM on 8 GB development machines.

## Requirement References

- PRD Section 3
- ARCH-001

## Dependencies

### Blocked By
- TASK-001

### Blocks
- TASK-003
- TASK-008

## Architecture References

- ARCHITECTURE.md -> Environments
- DECISIONS.md -> DEC-009

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: ci-cd-and-automation
- Skill: ci-cd-and-automation
- Location: `skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md`
- Why required: Governs container orchestration and local dev profiles.
- Installation/activation required: No
- Instructions that apply to this task:
  - Keep default profile minimal (<500MB RAM)
  - Separate heavy profiles into optional files

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `infra/compose.yml`
- `.env.example`

## Current Behavior

Completed. compose.yml boots PostgreSQL 16 and Redis 7 with healthchecks.

## Required Behavior

docker compose up -d boots healthy PostgreSQL on 5432 and Redis on 6379.

## Inputs / Outputs / Contracts

Port mappings: 5432 (PG), 6379 (Redis).

## Implementation Commands

Execute in this order:

1. Create infra/compose.yml defining postgres and redis services.
2. Configure volume persistence and healthcheck probes.
3. Document resource limits in .env.example.

## Data / Database Changes

None.

## Security Requirements

Default development passwords documented; production deployment mandates secure override.

## Error Handling

Container healthchecks retry 5 times before failing.

## Edge Cases

- Port collision with host PostgreSQL/Redis

## Observability

Docker health status indicators.

## Tests Required

### Unit
- docker compose config validation

### Integration
- Container port readiness check

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Execute docker compose up -d; verify postgres and redis report healthy status.

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
Single review pass. Documented in docs/reviews/t004-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`chore(infra): add minimal docker compose profile for postgres and redis`

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
