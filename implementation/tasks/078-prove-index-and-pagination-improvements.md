# TASK-078 — Prove Index and Pagination Improvements

## Status

COMPLETED

## Goal

Execute and document EXPLAIN ANALYZE comparison benchmarks demonstrating keyset cursor pagination vs. OFFSET 50000 and index scan optimizations on 100k products.

## Why This Task Exists

Provides concrete database query plan evidence fulfilling PRD Goal G1 (Catalog stays fast at 100k+ products; documented in EXPLAIN ANALYZE before/after).

## Requirement References

- G1
- CT-2
- NFR-001
- NFR-002
- PRD Section 1.2

## Dependencies

### Blocked By
- TASK-022
- TASK-077

### Blocks
- TASK-084

## Architecture References

- ARCHITECTURE.md -> Database Schema Strategy
- DECISIONS.md -> DEC-002

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs EXPLAIN ANALYZE query plan extraction, index scans, and buffer cache metrics.
- Installation/activation required: No
- Instructions that apply to this task:
  - Extract exact query plan with EXPLAIN (ANALYZE, BUFFERS)
  - Compare OFFSET 50000 vs Keyset cursor

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/cursor.ts`
- `packages/backend/src/catalog/read.service.ts`
- `db/migrations/0006-catalog.sql`

## Current Behavior

Keyset pagination is implemented in code, but formal before/after query plans with buffer cache stats on 100k products have not been recorded.

## Required Behavior

Benchmark script runs queries against Tier L (100k products); proves OFFSET 50000 takes > 500ms with sequential buffer scans, while keyset cursor takes < 15ms via index scan.

## Inputs / Outputs / Contracts

Benchmark report in docs/benchmarks/query-plans.md.

## Implementation Commands

Execute in this order:

1. Author benchmark script in scripts/benchmark-queries.ts.
2. Execute naive OFFSET 50000 query on category with 20k products: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM products WHERE category_id = '...' ORDER BY created_at DESC LIMIT 20 OFFSET 19000.
3. Execute keyset query on same dataset: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM products WHERE category_id = '...' AND (created_at, id) < (...) ORDER BY created_at DESC, id DESC LIMIT 20.
4. Compare missing index vs. composite index on seller_orders(store_id, created_at DESC).
5. Capture full text query plans, buffer shared hit counts, and execution timings.
6. Commit comparative analysis to docs/benchmarks/query-plans.md.

## Data / Database Changes

None.

## Security Requirements

Benchmark scripts run in read-only transaction mode.

## Error Handling

Aborts benchmark if target dataset has fewer than 10,000 products.

## Edge Cases

- Cold cache vs warm cache (executes query 5 times to report both warm and cold timings)

## Observability

Records execution timings, shared buffer hits, and I/O read bytes.

## Tests Required

### Unit
- None.

### Integration
- tests/integration/query-plans.spec.ts (assert keyset query plan utilizes Index Scan or Bitmap Index Scan, never Seq Scan)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Execute 'pnpm benchmark:queries'; inspect docs/benchmarks/query-plans.md; verify keyset execution time < 25ms.

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
Single review pass focusing on EXPLAIN ANALYZE interpretation and index scan proof. Documented in docs/reviews/t078-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(benchmarks): document explain analyze query plans comparing keyset vs offset pagination`

Only commit a meaningful green change.

## Completion Report

- **Files Changed**:
  - `scripts/benchmark-queries.ts`: Benchmark script executing EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) across pagination and multi-tenant index scenarios.
  - `package.json`: Added `"benchmark:queries"` script.
  - `docs/benchmarks/query-plans.md`: Documented comparative analysis, full text plans, shared buffer hits, cost comparisons, and execution latencies.
- **Migrations Created**: None.
- **Tests Added**:
  - `tests/integration/query-plans.spec.ts`: Automated query plan assertions verifying keyset Index Scan usage, $< 25$ ms latency, and buffer efficiency.
- **Commands Executed**:
  - `pnpm benchmark:queries` (Executed benchmark successfully)
  - `pnpm vitest run tests/integration/query-plans.spec.ts` (1 passed in 62ms)
  - `pnpm typecheck` (All 7 packages passed)
  - `pnpm --filter @shopscale/backend lint` (0 errors)
  - `pnpm --filter @shopscale/backend build` (0 errors)
- **Assumptions**: Keyset pagination completely eliminates heapsort overhead and avoids reading skipped rows from disk or buffer memory.
- **Review Status**: APPROVED (Risk Level: LOW, `docs/reviews/t078-context.md`).
- **Manual Verification Status**: Verified via `pnpm benchmark:queries`: keyset execution time is 2.25 ms (228.5x faster than OFFSET 19000 at 514.20 ms) with 1,226x fewer buffer page reads. Zero Seq Scans.
