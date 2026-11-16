# TASK-044 — Prove Cross-Channel Stock Contention

## Status

COMPLETED

## Goal

Build automated high-concurrency test suite proving 500 concurrent buyers competing for 50 stock units across marketplace and store channels never oversell.

## Why This Task Exists

Provides indisputable portfolio-grade proof of PRD Goal G2 (Never oversell stock under concurrency).

## Requirement References

- G2
- IN-3
- NFR-008
- PRD Section 1.2

## Dependencies

### Blocked By
- TASK-038
- TASK-039
- TASK-041

### Blocks
- TASK-047
- TASK-079

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- DECISIONS.md -> DEC-005

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs high-concurrency load scenario scripting and thread pool analysis.
- Installation/activation required: No
- Instructions that apply to this task:
  - Configure 500 concurrent virtual users
  - Assert zero database deadlocks

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces rigorous validation of stock invariants under race conditions.
- Installation/activation required: No
- Instructions that apply to this task:
  - Verify exactly 50 successes
  - Verify exactly 450 rejections with 409 Conflict

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/inventory/inventory.service.ts`
- `loadtests/flash-sale.js`
- `01-ecommerce-marketplace-PRD.md`

## Current Behavior

Not implemented. No automated multi-threaded load script exists to prove inventory concurrency.

## Required Behavior

Load script executes 500 simultaneous reservation calls against a variant with 50 units; exactly 50 succeed; exactly 450 fail with INSUFFICIENT_STOCK; final on_hand - reserved == 0; zero oversold units.

## Inputs / Outputs / Contracts

k6 scenario script in loadtests/flash-sale.js.

## Implementation Commands

Execute in this order:

1. Author k6 concurrency script in loadtests/flash-sale.js targeting /v1/test/concurrency-reserve.
2. Seed target product variant with on_hand = 50, reserved = 0.
3. Execute k6 run with 500 virtual users firing in a 2-second burst.
4. Assert 50 HTTP 200/201 responses and 450 HTTP 409 responses.
5. Assert SQL query: SELECT on_hand, reserved FROM inventory WHERE variant_id = '...' yields 50, 50.
6. Assert sum(delta_reserved) in stock_movements equals exactly 50.
7. Document execution results and query timings in docs/reviews/t044-context.md.

## Data / Database Changes

None in schema; exercises inventory and stock_movements.

## Security Requirements

Exercises concurrency under unique actor credentials.

## Error Handling

Failed reservations must return clean 409 INSUFFICIENT_STOCK without connection pool exhaustion.

## Edge Cases

- PostgreSQL connection pool saturation under 500 connections (k6 connection pooling configured to match pg pool size)

## Observability

Captures lock wait duration and transaction commit latency.

## Tests Required

### Unit
- None.

### Integration
- tests/integration/concurrency-race.spec.ts (Node.js Promise.all concurrency simulation with 50 threads)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Execute 'pnpm exec k6 run loadtests/flash-sale.js'; inspect terminal output; verify checks pass with 0 errors.

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
Multiple review passes on concurrency evidence and deadlock metrics. Recorded in docs/reviews/t044-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(inventory): prove zero overselling under 500 concurrent buyers`

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
