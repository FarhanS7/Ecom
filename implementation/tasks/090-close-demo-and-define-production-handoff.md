# TASK-090 — Close Demo and Define Production Handoff

## Status

COMPLETED

## Goal

Perform final validation sign-off, freeze demo baseline, and author production handoff specification in docs/production/roadmap.md.

## Why This Task Exists

Cleanly marks the portfolio demo project as completed while defining exact real-money production requirements (Stripe, carriers, taxes).

## Requirement References

- PRD Section 1.3
- PRD Section 1.4
- PRD_TO_TASKS_FRAMEWORK Phase 5

## Dependencies

### Blocked By
- TASK-084
- TASK-086
- TASK-087
- TASK-088
- TASK-089

### Blocks
- None

## Architecture References

- ARCHITECTURE.md
- docs/production/roadmap.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: shipping-and-launch
- Skill: shipping-and-launch
- Location: `skills/agent-skills-main/skills/shipping-and-launch/SKILL.md`
- Why required: Governs final project sign-off, tagging, and production handoff documentation.
- Installation/activation required: No
- Instructions that apply to this task:
  - Tag git release v1.0.0
  - Document deferred production dependencies clearly

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `docs/planning/traceability.md`
- `tasks/todo.md`
- `docs/production/roadmap.md`

## Current Behavior

Project is in active development with open tasks.

## Required Behavior

All 91 tasks complete or explicitly deferred; all traceability requirements mapped; docs/production/roadmap.md documents transition to real-money platform; git repository tagged v1.0.0.

## Inputs / Outputs / Contracts

Production roadmap in docs/production/roadmap.md.

## Implementation Commands

Execute in this order:

1. Verify all 91 tasks in implementation/tasks/ have completed statuses or approved deferrals.
2. Verify all PRD requirements in REQUIREMENT_TRACEABILITY.md are satisfied.
3. Author docs/production/roadmap.md defining: Live Stripe Integration, Real Shipping Carrier APIs, Multi-Currency Tax Engines (Avalara), and Custom Domain Routing.
4. Run full test suite: pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e.
5. Merge dev branch into main branch.
6. Tag git release: git tag -a v1.0.0 -m 'ShopScale V1.0.0 Portfolio Release'.
7. Publish final sign-off report.

## Data / Database Changes

None.

## Security Requirements

Ensures no development secrets or temporary test fixtures are flagged for real production use.

## Error Handling

Sign-off fails if any automated test, lint, or typecheck check fails.

## Edge Cases

- Unmet stretch goal (explicitly documented as P2 / Post-V1 in roadmap without blocking release)

## Observability

Final project sign-off report.

## Tests Required

### Unit
- Full workspace unit test suite (100% green)

### Integration
- Full workspace integration test suite (100% green)

### End-to-End
- Full Playwright E2E suite (100% green)

### Security / Regression
- Security matrix suite (100% green)

Do not mark the task complete until required tests pass.

## Manual Verification

Review git status on main branch; verify clean working tree, green CI badge, and v1.0.0 release tag.

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
LOW

Review requirements:
Final architectural sign-off review. Documented in docs/reviews/t090-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`release(v1.0.0): close demo project and define production roadmap handoff`

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
