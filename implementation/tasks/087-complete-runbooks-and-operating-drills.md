# TASK-087 — Complete Runbooks and Operating Drills

## Status

COMPLETED

## Goal

Author operational runbooks for incident response, worker restart, search reindexing, payment webhook reconciliation, and queue drain drills.

## Why This Task Exists

Fulfills PRD Goal G6 (Operable: metrics, tracing, structured logs, dashboards, runbook).

## Requirement References

- G6
- PRD Section 1.2
- PRD_TO_TASKS_FRAMEWORK Phase 5

## Dependencies

### Blocked By
- TASK-034
- TASK-072
- TASK-073
- TASK-085
- TASK-086

### Blocks
- TASK-090

## Architecture References

- ARCHITECTURE.md -> Operations
- docs/operations/runbooks.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: documentation-and-adrs
- Skill: documentation-and-adrs
- Location: `skills/agent-skills-main/skills/documentation-and-adrs/SKILL.md`
- Why required: Governs operational runbook structure and disaster recovery playbooks.
- Installation/activation required: No
- Instructions that apply to this task:
  - Write copy-pasteable CLI commands for operators
  - Include diagnosis and rollback steps for each alert

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `docs/operations/runbooks.md`
- `infra/prometheus/alerts.yml`
- `docs/operations/commands.md`

## Current Behavior

Operating instructions are dispersed across planning documents without standard operational runbooks.

## Required Behavior

docs/operations/runbooks.md provides copy-pasteable operator guides for: High Outbox Lag, Failed Webhooks, Stale Search Index, Database Connection Saturation, and Recovery Rehearsals.

## Inputs / Outputs / Contracts

Authoritative runbooks in docs/operations/runbooks.md.

## Implementation Commands

Execute in this order:

1. Author docs/operations/runbooks.md covering 5 primary operational incidents.
2. Include Runbook 1: Outbox Relay Lag High (how to inspect unleased rows, restart worker, force poll).
3. Include Runbook 2: Webhook Signature Failure Storm (how to diagnose secret mismatch, replay quarantined events).
4. Include Runbook 3: Search Projection Drift (how to run zero-downtime full reindex safely).
5. Include Runbook 4: Database Connection Starvation (how to inspect pg_stat_activity, kill idle locks).
6. Include Runbook 5: Payment Reconciliation Failure (how to inspect pending charges, trigger manual reconciliation).
7. Execute and verify each runbook drill in local environment.

## Data / Database Changes

None.

## Security Requirements

Ensures operators have documented, sanctioned operational procedures without ad-hoc production patching.

## Error Handling

Runbooks include step-by-step diagnostic checklists for ambiguous failure modes.

## Edge Cases

- Operator executing reindex during high checkout traffic (documents how to throttle batch size to 100)

## Observability

References exact Prometheus metrics and log queries for each alert.

## Tests Required

### Unit
- None.

### Integration
- None.

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Follow Runbook 1 in local shell; execute commands; verify outbox relay status responds as documented.

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
Single review pass focusing on command accuracy and operator clarity. Documented in docs/reviews/t087-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`docs(ops): complete operational incident runbooks and emergency playbooks`

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
