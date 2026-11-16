# TASK-030 — Implement Idempotent Projection Consumers

## Status

COMPLETED

## Goal

Build worker consumer framework with consumer_receipts deduplication table and versioned search_documents projection handler.

## Why This Task Exists

Guarantees that replayed, duplicate, or out-of-order domain events cannot regress read models or cause duplicate side effects.

## Requirement References

- CT-6
- G5
- PRD Section 4
- docs/architecture/events.md

## Dependencies

### Blocked By
- TASK-029

### Blocks
- TASK-031
- TASK-034
- TASK-044
- TASK-064

## Architecture References

- ARCHITECTURE.md -> Synchronous vs Asynchronous
- DECISIONS.md -> DEC-006
- DEC-007

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing out-of-order event delivery before writing projection handlers.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test v3 arriving before v2
  - Verify duplicate receipt rejection

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs consumer contract and idempotent handler interfaces.
- Installation/activation required: No
- Instructions that apply to this task:
  - Commit consumer receipt inside handler transaction
  - Enforce version monotonicity

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/worker/src/main.ts`
- `packages/backend/src/catalog/schema.ts`
- `docs/architecture/events.md`

## Current Behavior

Not implemented. BullMQ worker does not consume domain events or update search projections.

## Required Behavior

Worker consumes 'domain-events' from BullMQ; checks consumer_receipts; projects product changes into search_documents; ignores stale versions.

## Inputs / Outputs / Contracts

consumer_receipts: (consumer_name PK, event_id PK, processed_at). search_documents projection schema.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0008-search-projection.sql creating search_documents and consumer_receipts tables.
2. Implement ConsumerReceiptPort in packages/backend/src/platform/consumer.ts.
3. Implement ProductProjector in packages/backend/src/search/projector.ts handling ProductChanged and PublicationChanged events.
4. Implement version check: reject update if event.aggregateVersion <= search_documents.source_version.
5. Wire BullMQ worker in apps/worker/src/consumers/domain-events.consumer.ts.
6. Write integration test tests/integration/projection.spec.ts delivering v3 before v2 and replaying identical events.

## Data / Database Changes

Creates search_documents and consumer_receipts tables in migration 0008-search-projection.sql.

## Security Requirements

Search projection contains only public, non-PII catalog attributes.

## Error Handling

Failed projection transactions throw and trigger BullMQ exponential retry; duplicate receipts return success without re-processing.

## Edge Cases

- Event v3 arrives before v2; v2 must be ignored when it later arrives
- Product archived/deleted: search document receives tombstone (visibility=false) so stale events cannot resurrect it

## Observability

Logs event processing duration and version comparison outcomes; records consumer lag metrics.

## Tests Required

### Unit
- packages/backend/src/search/projector.test.ts (version guard logic, tombstone handling)

### Integration
- tests/integration/projection.spec.ts (assert receipt committed with projection; assert duplicate event ignored; assert v2 ignored after v3)

### End-to-End
- None.

### Security / Regression
- Verify unpublished product is excluded from search_documents

Do not mark the task complete until required tests pass.

## Manual Verification

Update product title in seller console; verify search_documents table in PostgreSQL reflects new title and incremented version.

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
Single thorough review pass focusing on version monotonicity and crash recovery. Recorded in docs/reviews/t030-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(search): implement idempotent event consumer and search projection`

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
