# TASK-002 — Establish the TypeScript Workspace

## Status

IMPLEMENTED

## Goal

Configure pnpm monorepo workspace with apps/ (api, web, worker) and packages/ (backend, contracts, config).

## Why This Task Exists

Provides decoupled project boundaries and shared TypeScript compilation rules.

## Requirement References

- ARCH-001
- PRD Section 3

## Dependencies

### Blocked By
- TASK-001

### Blocks
- TASK-003
- TASK-005
- TASK-006
- TASK-007
- TASK-008

## Architecture References

- ARCHITECTURE.md -> System shape
- DECISIONS.md -> DEC-001

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: ci-cd-and-automation
- Skill: ci-cd-and-automation
- Location: `skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md`
- Why required: Governs monorepo toolchain and package graph configuration.
- Installation/activation required: No
- Instructions that apply to this task:
  - Configure strict TypeScript across all workspaces
  - Enforce pnpm workspace filters

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`

## Current Behavior

Completed. Monorepo configured with pnpm 9, Fastify/NestJS API, Next.js web, and shared packages.

## Required Behavior

Root pnpm build and pnpm typecheck compile all workspaces with zero errors.

## Inputs / Outputs / Contracts

pnpm-workspace.yaml package paths and tsconfig project references.

## Implementation Commands

Execute in this order:

1. Initialize pnpm monorepo structure.
2. Configure tsconfig.base.json with strict compiler checks.
3. Wire packages/backend, packages/contracts, and packages/config into workspace.

## Data / Database Changes

None.

## Security Requirements

Enforces no direct cross-package database imports from apps/web to packages/backend.

## Error Handling

Build fails loudly on type errors.

## Edge Cases

- Circular package references
- TypeScript version mismatches

## Observability

Workspace compilation logs.

## Tests Required

### Unit
- package.json scripts validation

### Integration
- Workspace build verification

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Run pnpm install && pnpm build. Assert all packages build with code 0.

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
Single independent review pass. Verified in docs/reviews/t002-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`chore(workspace): establish pnpm workspace and typescript configs`

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
