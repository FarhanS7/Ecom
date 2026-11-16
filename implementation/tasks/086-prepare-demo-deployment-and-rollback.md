# TASK-086 — Prepare Demo Deployment and Rollback

## Status

COMPLETED

## Goal

Author production deployment packaging (docker-compose.prod.yml), environment variable contracts, and documented rollback triggers.

## Why This Task Exists

Fulfills PRD_TO_TASKS_FRAMEWORK Phase 4 (Deployment & Release) and ensures predictable, reversible deployment.

## Requirement References

- G6
- PRD_TO_TASKS_FRAMEWORK Phase 4

## Dependencies

### Blocked By
- TASK-004
- TASK-085

### Blocks
- TASK-087
- TASK-090

## Architecture References

- ARCHITECTURE.md -> Deployment
- docs/production/deployment.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: shipping-and-launch
- Skill: shipping-and-launch
- Location: `skills/agent-skills-main/skills/shipping-and-launch/SKILL.md`
- Why required: Governs production release procedures, container packaging, and rollback plans.
- Installation/activation required: No
- Instructions that apply to this task:
  - Define explicit rollback trigger conditions
  - Ensure migrations run before new containers boot

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `infra/compose.prod.yml`
- `Dockerfile`
- `.env.example`

## Current Behavior

Only development compose.yml exists; production containerization and rollback playbooks are unwritten.

## Required Behavior

docker-compose.prod.yml boots production-optimized containers (Fastify API, Next.js standalone, BullMQ worker, Postgres, Redis); rollback trigger written down before deployment.

## Inputs / Outputs / Contracts

Production Compose profile in infra/compose.prod.yml.

## Implementation Commands

Execute in this order:

1. Author production Dockerfiles with multi-stage builds for apps/api, apps/web, and apps/worker.
2. Build infra/compose.prod.yml with restart: always, logging rotation, and healthchecks.
3. Write migration pre-deploy step: run pnpm db:migrate before starting API containers.
4. Document concrete rollback triggers: error rate > 0.5% for 2 consecutive minutes or failed healthchecks.
5. Document rollback procedure: redeploy previous container tag; additive migrations guarantee backward compatibility.
6. Document deployment guide in docs/operations/deployment.md.

## Data / Database Changes

None.

## Security Requirements

Containers run as unprivileged 'node' user; secrets injected strictly through environment variables.

## Error Handling

Containers restart automatically upon unexpected exit.

## Edge Cases

- Failed migration during deploy (aborts deployment before switching traffic to new container versions)

## Observability

Docker health monitoring and container log rotation.

## Tests Required

### Unit
- Dockerfile syntax and multi-stage build check

### Integration
- Production container boot test

### End-to-End
- None.

### Security / Regression
- Assert containers run as non-root user (id -u node == 1000)

Do not mark the task complete until required tests pass.

## Manual Verification

Execute docker compose -f infra/compose.prod.yml config; verify valid configuration and start demo in production profile.

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
Single thorough review pass focusing on additive-first migration safety and container security. Documented in docs/reviews/t086-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(ops): author production docker compose packaging and documented rollback plan`

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
