# TASK-029 — Implement Transactional Outbox and Relay

## Status

COMPLETED

## Goal

Build outbox schema, transactional outbox writer port, and background relay worker polling with FOR UPDATE SKIP LOCKED.

## Why This Task Exists

Eliminates dual-write inconsistencies between PostgreSQL and BullMQ queues, ensuring zero lost events on failure.

## Requirement References

- OR-4
- CT-6
- G5
- PRD Section 4

## Dependencies

### Blocked By
- TASK-003
- TASK-020
- TASK-028

### Blocks
- TASK-030
- TASK-034
- TASK-047
- TASK-071
- TASK-073

## Architecture References

- ARCHITECTURE.md -> Synchronous vs Asynchronous
- DECISIONS.md -> DEC-006
- docs/architecture/events.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Ensures transaction boundary and outbox relay are verified with failing tests first.
- Installation/activation required: No
- Instructions that apply to this task:
  - Write outbox rollback test first
  - Verify FOR UPDATE SKIP LOCKED concurrency

### Skill 2: observability-and-instrumentation
- Skill: observability-and-instrumentation
- Location: `skills/agent-skills-main/skills/observability-and-instrumentation/SKILL.md`
- Why required: Governs outbox queue lag metrics and relay polling telemetry.
- Installation/activation required: No
- Instructions that apply to this task:
  - Track oldest unconsumed event age
  - Include correlation IDs in event envelopes

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/platform/database.ts`
- `packages/backend/src/catalog/seller-catalog.service.ts`
- `apps/worker/src/main.ts`
- `docs/architecture/events.md`

## Current Behavior

Not implemented. Domain mutations commit to PostgreSQL directly without recording outbox events or notifying workers.

## Required Behavior

Every domain mutation writes an event into the outbox table inside its database transaction; relay worker polls unpublished events and enqueues BullMQ jobs with stable IDs.

## Inputs / Outputs / Contracts

OutboxRecord: { id: UUID, aggregateType: string, aggregateId: UUID, aggregateVersion: number, type: string, schemaVersion: number, payload: JSONB, createdAt: Date, publishedAt: Date | null, leaseUntil: Date | null, attempts: number }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0007-outbox.sql creating outbox table with partial index on (created_at, id) WHERE published_at IS NULL.
2. Implement OutboxWriterPort in packages/backend/src/platform/outbox.service.ts accepting UnitOfWorkContext and domain event.
3. Wire OutboxWriterPort into Catalog mutations (ProductChanged, PublicationChanged).
4. Build OutboxRelay service in apps/worker/src/relay/outbox-relay.ts polling with SELECT ... FOR UPDATE SKIP LOCKED.
5. Publish claimed events into BullMQ queue 'domain-events' with jobId = eventId.
6. Update outbox record with published_at = NOW() upon queue acknowledgment.
7. Add integration test tests/integration/outbox.spec.ts verifying transactional rollback and duplicate relay safety.

## Data / Database Changes

Creates outbox table in migration 0007-outbox.sql with partial index.

## Security Requirements

Outbox payloads must never store raw session tokens, passwords, or customer payment card data.

## Error Handling

Relay handles BullMQ connection loss by releasing leases and backing off with exponential jitter.

## Edge Cases

- Relay crashes immediately after enqueuing to BullMQ but before updating published_at (deterministic jobId prevents duplicate queue execution)
- Outbox polling under empty table (must sleep 200ms without busy-waiting CPU)

## Observability

Logs outbox batch counts; records Prometheus gauge outbox_queue_lag_seconds.

## Tests Required

### Unit
- packages/backend/src/platform/outbox.service.test.ts (envelope validation, JSON serialization)
- apps/worker/src/relay/outbox-relay.test.ts (batch claiming, lease expiry)

### Integration
- tests/integration/outbox.spec.ts (verify business write + outbox commit atomically; verify rollback rolls back both; verify relay worker claims and marks published)

### End-to-End
- None.

### Security / Regression
- Verify outbox payload redacts sensitive user fields

Do not mark the task complete until required tests pass.

## Manual Verification

Trigger product edit via API; inspect outbox table in PostgreSQL; verify published_at updates to non-null timestamp within 1 second.

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
Requires two independent review passes on transactional boundaries and lease concurrency. Follow PRD_TO_TASKS_FRAMEWORK Phase 2.5.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(platform): implement transactional outbox and worker relay with skip locked`

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
