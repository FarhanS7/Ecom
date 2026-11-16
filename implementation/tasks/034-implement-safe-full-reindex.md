# TASK-034 — Implement Safe Full Reindex

## Status

COMPLETED

## Goal

Build zero-downtime full reindex CLI command that rebuilds the search_documents projection from primary catalog tables in bounded batches.

## Why This Task Exists

Enables operators to recover search projections after schema changes, database migrations, or corruption without taking search offline.

## Requirement References

- CT-6
- G5
- PRD Section 6.2

## Dependencies

### Blocked By
- TASK-029
- TASK-030
- TASK-031

### Blocks
- TASK-077
- TASK-087

## Architecture References

- ARCHITECTURE.md -> Operations
- docs/modules/search.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs cursor batching and zero-downtime projection swaps.
- Installation/activation required: No
- Instructions that apply to this task:
  - Process in batches of 500 using keyset cursor
  - Do not lock primary tables during reindex

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/search/projector.ts`
- `packages/backend/src/search/schema.ts`
- `apps/worker/src/main.ts`

## Current Behavior

Not implemented. If search_documents becomes corrupt or out of sync, there is no mechanism to regenerate it.

## Required Behavior

Running 'pnpm search:reindex' processes all active products in bounded batches (500 items), updates search documents, and reports progress with zero search downtime.

## Inputs / Outputs / Contracts

CLI command: pnpm search:reindex [--batch-size=500] [--store=slug].

## Implementation Commands

Execute in this order:

1. Build ReindexService in packages/backend/src/search/reindex.service.ts.
2. Implement keyset batch pagination over products and variants.
3. Use INSERT ... ON CONFLICT (product_id) DO UPDATE to atomically refresh documents without deleting active index.
4. Add CLI script in scripts/reindex.ts with progress bar and timing summary.
5. Add integration test verifying reindex restores missing search documents.

## Data / Database Changes

Bulk updates search_documents table.

## Security Requirements

Reindex script requires administrative credentials or operational CLI access.

## Error Handling

Logs failed batch IDs and continues remaining batches; exits with non-zero code if any batch fails.

## Edge Cases

- Product edited while reindex is running (outbox version check prevents reindex from overwriting newer edit)

## Observability

Prints progress percentage, items/sec throughput, and total elapsed duration.

## Tests Required

### Unit
- packages/backend/src/search/reindex.service.test.ts (batching logic, conflict update)

### Integration
- tests/integration/reindex.spec.ts (truncate search_documents; run reindex; assert 100% of products restored and searchable)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Truncate search_documents in psql; run pnpm search:reindex; verify search results return full product count.

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
Single review pass. Documented in docs/reviews/t034-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(search): implement zero-downtime full catalog reindex cli tool`

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
