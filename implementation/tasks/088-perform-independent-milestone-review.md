# TASK-088 — Perform Independent Milestone Review

## Status

COMPLETED

## Goal

Execute multi-pass adversarial code review in fresh sessions across critical security, concurrency, and financial modules, resolving all critical/high findings.

## Why This Task Exists

Fulfills PRD_TO_TASKS_FRAMEWORK Phase 2.5 (AI Adversarial Review) to guarantee zero unverified AI-generated flaws ship in V1.

## Requirement References

- G4
- PRD_TO_TASKS_FRAMEWORK Phase 2.5
- Phase 0.5

## Dependencies

### Blocked By
- TASK-074
- TASK-075
- TASK-076

### Blocks
- TASK-089
- TASK-090

## Architecture References

- ARCHITECTURE.md
- PRD_TO_TASKS_FRAMEWORK.md -> Phase 2.5

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: code-review-and-quality
- Skill: code-review-and-quality
- Location: `skills/agent-skills-main/skills/code-review-and-quality/SKILL.md`
- Why required: Governs adversarial code review methodology and fresh-session evaluation.
- Installation/activation required: No
- Instructions that apply to this task:
  - Review with fresh context (never review own code in same turn)
  - Focus on concurrency, auth, and data leakage

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/inventory/inventory.service.ts`
- `packages/backend/src/commerce/checkout.service.ts`
- `packages/backend/src/payments/financial-ledger.service.ts`
- `docs/reviews/`

## Current Behavior

Individual milestone checkpoints have been reviewed; a unified final milestone audit covering all cross-module interactions is required.

## Required Behavior

Adversarial review reports generated in docs/reviews/final-review.md; all CRITICAL and HIGH severity findings resolved with dedicated regression tests.

## Inputs / Outputs / Contracts

Review report format in docs/reviews/final-review.md.

## Implementation Commands

Execute in this order:

1. Generate comprehensive REVIEW_CONTEXT.md covering all shipped modules.
2. Execute adversarial review in clean session targeting: Inventory row locking, Payment idempotency, Multi-tenant store scoping, Financial ledger zero-sum balance.
3. Record findings in docs/reviews/final-review-report.md.
4. Fix any discovered critical, high, or medium findings in feature branches.
5. Re-run review cycle until zero critical or high issues remain.
6. Commit final review approval report.

## Data / Database Changes

None in schema unless required by a verified bug fix.

## Security Requirements

Audits all authentication guards, session management, and CSRF implementations.

## Error Handling

All identified edge cases receive regression test coverage.

## Edge Cases

- Reviewer model hallucinates non-existent defect (documented with code proof in report and dismissed)

## Observability

Review report audit record.

## Tests Required

### Unit
- Regression tests for all resolved review findings

### Integration
- Full test suite execution

### End-to-End
- Full Playwright suite execution

### Security / Regression
- Security matrix pass confirmation

Do not mark the task complete until required tests pass.

## Manual Verification

Review docs/reviews/final-review-report.md; verify zero open CRITICAL or HIGH findings remain.

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
HIGH

Review requirements:
Requires 3 full adversarial review cycles across distinct fresh sessions. Follow PRD_TO_TASKS_FRAMEWORK Phase 2.5.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`docs(reviews): complete final independent milestone adversarial code review`

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
