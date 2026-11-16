# TASK-008 — Add Initial Continuous Integration Gates

## Status

IMPLEMENTED

## Goal

Configure GitHub Actions CI workflow running lint, typecheck, unit tests, and build on all branches.

## Why This Task Exists

Mechanically prevents broken code, convention violations, or type errors from merging into dev.

## Requirement References

- PRD_TO_TASKS_FRAMEWORK Phase 1.5

## Dependencies

### Blocked By
- TASK-002
- TASK-003
- TASK-005
- TASK-006
- TASK-007

### Blocks
- TASK-009

## Architecture References

- PRD_TO_TASKS_FRAMEWORK.md -> Phase 1.5

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: ci-cd-and-automation
- Skill: ci-cd-and-automation
- Location: `skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md`
- Why required: Defines automated test execution in CI environments.
- Installation/activation required: No
- Instructions that apply to this task:
  - Run fast checks first
  - Ensure deterministic pnpm cache

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `.github/workflows/ci.yml`
- `package.json`

## Current Behavior

Completed. GitHub Actions workflow runs pnpm lint, typecheck, and test on push.

## Required Behavior

CI fails on any lint error, TypeScript type mismatch, or test failure.

## Inputs / Outputs / Contracts

Exit code 0 on green, non-zero on failure.

## Implementation Commands

Execute in this order:

1. Create .github/workflows/ci.yml.
2. Configure pnpm cache action and Node.js setup.
3. Add test, lint, and typecheck steps.

## Data / Database Changes

None.

## Security Requirements

Runs in isolated runner with unprivileged permissions.

## Error Handling

Build fails loudly with detailed error logs on first failure.

## Edge Cases

- Flaky tests due to timer races

## Observability

GitHub Actions run summary.

## Tests Required

### Unit
- package.json test script check

### Integration
- Local pnpm test execution across all workspaces

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Run pnpm lint && pnpm typecheck && pnpm test locally. Assert all exit 0.

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
Single review pass. Documented in docs/reviews/milestone-0-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`chore(ci): add github actions workflow for lint typecheck and tests`

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
