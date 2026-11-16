# TASK-081 — Compare Optional OpenSearch Adapter

## Status

COMPLETED

## Goal

Build optional OpenSearch 8 search adapter implementing SearchPort and benchmark latency and indexing throughput against PostgreSQL search projection.

## Why This Task Exists

Evaluates the trade-offs of dedicated search infrastructure versus PostgreSQL FTS, providing architectural clarity for future scale.

## Requirement References

- CT-6
- PRD Section 3
- PRD Section 4

## Dependencies

### Blocked By
- TASK-031
- TASK-077

### Blocks
- TASK-084

## Architecture References

- ARCHITECTURE.md -> First bottleneck and scaling path
- DECISIONS.md -> DEC-007

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs comparative benchmarking of search engine throughput and RAM footprint.
- Installation/activation required: No
- Instructions that apply to this task:
  - Implement exact same SearchPort interface
  - Measure memory consumption alongside latency

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/search/query.service.ts`
- `packages/contracts/src/search.ts`
- `infra/compose.search.yml`

## Current Behavior

PostgreSQL search projection is the sole search engine; OpenSearch adapter is not implemented.

## Required Behavior

OpenSearchSearchAdapter implements SearchPort; optional compose.search.yml boots OpenSearch 8 container; benchmark script compares p95 latency and memory footprint between Postgres FTS and OpenSearch on 100k products.

## Inputs / Outputs / Contracts

SearchPort in @shopscale/backend/src/search/search.port.ts.

## Implementation Commands

Execute in this order:

1. Define optional infra/compose.search.yml with single-node OpenSearch 8 (capped at 1 GB heap).
2. Implement OpenSearchSearchAdapter in packages/backend/src/search/opensearch.adapter.ts.
3. Build indexer mapping with edge_ngram analyzer for autocomplete and standard analyzer with english stemmer for search.
4. Author comparative benchmark script in scripts/compare-search-engines.ts.
5. Execute 500 search queries across both engines; record p95 latency, indexing speed, and RAM usage.
6. Document comparison findings in docs/benchmarks/search-engine-comparison.md.

## Data / Database Changes

None in PostgreSQL; creates index in OpenSearch container.

## Security Requirements

OpenSearch container communication restricted to internal Docker network.

## Error Handling

System seamlessly runs with PostgreSQL FTS if OpenSearch container is absent.

## Edge Cases

- OpenSearch container OOM during bulk indexing (documents memory threshold on 8 GB machine)

## Observability

Search latency comparison metrics.

## Tests Required

### Unit
- packages/backend/src/search/opensearch-query-builder.test.ts (query DSL generation)

### Integration
- tests/integration/opensearch.spec.ts (index document; query OpenSearch; verify matching results)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Boot compose.search.yml; run search comparison script; inspect comparative markdown table.

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
Single review pass focusing on interface parity between PostgreSQL and OpenSearch adapters. Documented in docs/reviews/t081-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(search): implement optional opensearch adapter and comparative benchmark`

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
