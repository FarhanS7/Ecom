# TASK-082 — Explore Partitioning and Read Replicas

## Status

COMPLETED

## Goal

Build experimental schema partition on audit_logs and stock_movements by month, and benchmark read replica query routing for sales analytics.

## Why This Task Exists

Demonstrates architectural understanding of PostgreSQL table partitioning and OLTP vs. OLAP connection routing at 1M+ scale.

## Requirement References

- AD-2
- PRD Section 8.2
- PRD Section 9

## Dependencies

### Blocked By
- TASK-062
- TASK-066
- TASK-077

### Blocks
- TASK-084

## Architecture References

- ARCHITECTURE.md -> Database
- DECISIONS.md -> DEC-002

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs declarative table partitioning and partition pruning query plans.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use PARTITION BY RANGE (created_at)
  - Verify partition pruning via EXPLAIN ANALYZE

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/platform/database.ts`
- `db/migrations/0003-audit.sql`
- `01-ecommerce-marketplace-PRD.md`

## Current Behavior

All tables are single unpartitioned tables; all queries execute against the primary PostgreSQL connection pool.

## Required Behavior

Migration scripts demonstrate declarative range partitioning on append-only audit_logs; query plans demonstrate Partition Pruning; replica connection pool routes analytical queries.

## Inputs / Outputs / Contracts

ReplicaPoolPort in packages/backend/src/platform/database.ts.

## Implementation Commands

Execute in this order:

1. Author experimental migration db/migrations/0026-partitioning-experiment.sql creating audit_logs_partitioned PARTITION BY RANGE (created_at).
2. Create monthly child partitions for past 12 months.
3. Execute query filtering by specific month: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_logs_partitioned WHERE created_at >= '2026-05-01' AND created_at < '2026-06-01'.
4. Assert EXPLAIN plan displays 'Partitions: 1' demonstrating partition pruning (unused 11 partitions pruned).
5. Implement dual-pool router in database.ts directing analytics queries to READ_REPLICA_URL if configured.
6. Document partition plan and replication findings in docs/benchmarks/partitioning.md.

## Data / Database Changes

Creates partitioned tables and monthly child partitions in migration 0026-partitioning-experiment.sql.

## Security Requirements

Enforces identical access control on partitioned tables.

## Error Handling

Query gracefully routes to primary pool if read replica is unavailable.

## Edge Cases

- Inserting row outside pre-created partition ranges (defines DEFAULT partition to catch out-of-range dates)

## Observability

Partition pruning confirmation in query plans.

## Tests Required

### Unit
- None.

### Integration
- tests/integration/partitioning.spec.ts (insert across 3 monthly partitions; query 1 month; assert partition pruning in plan)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Run 'pnpm benchmark:partitioning'; verify terminal output shows Partition Pruning eliminating unselected months.

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
Single review pass focusing on partition key selection and unique constraint limitations. Documented in docs/reviews/t082-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(db): demonstrate declarative range partitioning and read replica routing`

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
