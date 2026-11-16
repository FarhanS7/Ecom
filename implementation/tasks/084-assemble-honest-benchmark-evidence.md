# TASK-084 — Assemble Honest Benchmark Evidence

## Status

COMPLETED

## Goal

Compile all raw k6 metrics, EXPLAIN ANALYZE query plans, Lighthouse audits, and chaos results into docs/benchmarks.md with transparent disclosures of hardware and limitations.

## Why This Task Exists

Fulfills portfolio success criteria: a reviewer can clone the repo, run make seed-l && make test-benchmarks, and reproduce every claim in the documentation.

## Requirement References

- G1
- G2
- G3
- G4
- G5
- G6
- PRD Section 1.4

## Dependencies

### Blocked By
- TASK-070
- TASK-071
- TASK-072
- TASK-073
- TASK-078
- TASK-079
- TASK-080
- TASK-081
- TASK-082
- TASK-083

### Blocks
- TASK-089
- TASK-090

## Architecture References

- ARCHITECTURE.md -> First bottleneck and scaling path
- 01-ecommerce-marketplace-PRD.md Section 1.4

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: documentation-and-adrs
- Skill: documentation-and-adrs
- Location: `skills/agent-skills-main/skills/documentation-and-adrs/SKILL.md`
- Why required: Governs technical documentation rigor and transparent benchmark reporting.
- Installation/activation required: No
- Instructions that apply to this task:
  - Disclose exact host hardware and CPU specs
  - Include raw JSON data alongside graphs
  - Never hide or invent numbers

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `docs/benchmarks.md`
- `loadtests/results/`
- `docs/benchmarks/query-plans.md`

## Current Behavior

Benchmark results are scattered across individual task review contexts without a single unified, reproducible benchmark report.

## Required Behavior

docs/benchmarks.md compiles all verified results: hardware specifications, Tier L seed timings, p95 browse/search/checkout latencies, flash-sale concurrency proof, chaos recovery times, and honest limitations.

## Inputs / Outputs / Contracts

Authoritative benchmark document in docs/benchmarks.md.

## Implementation Commands

Execute in this order:

1. Create docs/benchmarks.md summarizing all performance and reliability proof.
2. Include host machine specs (OS, CPU cores, RAM, Docker version).
3. Embed table comparing PRD Section 7 SLO targets against actual measured results.
4. Include EXPLAIN ANALYZE snippet proving keyset pagination index scan.
5. Include k6 flash-sale summary proving exactly 50 orders / 0 oversold units.
6. Document known limitations and first bottlenecks.
7. Provide one-command reproduction script: pnpm benchmark:all.

## Data / Database Changes

None.

## Security Requirements

Ensures all benchmark data is auditable and reproducible.

## Error Handling

Any unmet SLO must be labeled UNVERIFIED or FAILED, never falsely marked passed.

## Edge Cases

- Benchmark run on lower-spec machine (includes instructions on scaling down virtual users for 4GB hosts)

## Observability

Complete benchmark summary report.

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

Review docs/benchmarks.md; verify every table references raw data in loadtests/results/ with commit SHA.

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
Single review pass focusing on honesty, accuracy, and reproducibility of benchmark claims. Documented in docs/reviews/t084-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`docs(benchmarks): assemble authoritative benchmark evidence and reproducible results`

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
