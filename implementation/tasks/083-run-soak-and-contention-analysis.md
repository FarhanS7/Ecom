# TASK-083 — Run Soak and Contention Analysis

## Status

COMPLETED

## Goal

Execute multi-hour sustained load soak test evaluating memory leaks, PostgreSQL connection pool saturation, and row lock wait times under continuous traffic.

## Why This Task Exists

Proves the application is immune to memory leaks, connection pool starvation, and lock deadlocks during prolonged production operations.

## Requirement References

- G2
- G5
- NFR-007
- NFR-010

## Dependencies

### Blocked By
- TASK-077
- TASK-079

### Blocks
- TASK-084

## Architecture References

- ARCHITECTURE.md -> First bottleneck and scaling path
- 01-ecommerce-marketplace-PRD.md Section 12

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs soak test execution, heap snapshot analysis, and lock contention profiling.
- Installation/activation required: No
- Instructions that apply to this task:
  - Run sustained load for minimum 1 hour
  - Track Node.js heap used and PG lock wait events

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/platform/database.ts`
- `loadtests/browse-mix.js`
- `apps/api/src/main.ts`

## Current Behavior

Short burst tests execute, but multi-hour endurance soak tests evaluating memory stability have not been run.

## Required Behavior

Soak test executes sustained 200 req/s for 1 hour; memory heap remains flat (no memory leaks); PostgreSQL connection pool never starves; error rate remains < 0.1%.

## Inputs / Outputs / Contracts

Soak test script in loadtests/soak-test.js.

## Implementation Commands

Execute in this order:

1. Author loadtests/soak-test.js maintaining sustained 200 req/s mixed browse and checkout workload.
2. Record Node.js heap used at 5-minute intervals using process.memoryUsage().heapUsed.
3. Query pg_stat_activity and pg_locks every minute for lock wait duration and active transactions.
4. Assert heap usage stabilizes after initial warm-up without continuous upward slope.
5. Assert zero database connection pool timeouts.
6. Document memory profile and connection pool graphs in docs/benchmarks/soak-analysis.md.

## Data / Database Changes

None in schema; exercises database and API over extended duration.

## Security Requirements

Monitors connection exhaustion defenses under sustained traffic.

## Error Handling

Soak runner alerts immediately if error rate exceeds 0.5% during execution.

## Edge Cases

- Long-running transaction holding locks (detects and terminates idle-in-transaction connections > 30s)

## Observability

Heap snapshots, active pool connections, and lock wait histograms.

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

Execute 'pnpm loadtest:soak'; observe terminal memory curve remains flat over 1-hour run.

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
Single thorough review pass focusing on memory leak detection and connection pool configuration. Documented in docs/reviews/t083-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(load): execute sustained soak test and postgresql connection pool analysis`

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
