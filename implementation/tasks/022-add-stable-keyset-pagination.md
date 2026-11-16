# TASK-022 — Add Stable Keyset Pagination

## Status

IMPLEMENTED

## Goal

Build keyset (cursor-based) pagination on (created_at DESC, id DESC) and price/sort tuples.

## Why This Task Exists

Eliminates deep pagination performance cliffs and guarantees sub-150ms list queries on 100k products.

## Requirement References

- CT-2
- G1
- NFR-001
- NFR-002

## Dependencies

### Blocked By
- TASK-019

### Blocks
- TASK-025
- TASK-078

## Architecture References

- ARCHITECTURE.md -> API Structure
- DECISIONS.md -> DEC-002

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs keyset pagination encoding and index alignment.
- Installation/activation required: No
- Instructions that apply to this task:
  - Ban OFFSET/LIMIT pagination
  - Tie-break every sort with unique id

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/cursor.ts`
- `packages/backend/src/catalog/cursor.test.ts`

## Current Behavior

Completed. Opaque base64 cursor encodes sort tuple, filter hash, and schema version; unit tests passing.

## Required Behavior

Querying with nextCursor returns the next page of items without shifting or duplicates.

## Inputs / Outputs / Contracts

CursorPayload schema and encodeCursor/decodeCursor utilities.

## Implementation Commands

Execute in this order:

1. Implement base64url cursor encoder/decoder with checksum.
2. Build SQL tuple comparisons: (created_at, id) < (:cursor_created_at, :cursor_id).
3. Add tamper detection rejecting modified or mismatched cursors with 400 INVALID_CURSOR.

## Data / Database Changes

Verifies composite indexes on (category_id, created_at DESC, id DESC).

## Security Requirements

Validates cursor integrity; rejects arbitrary SQL injection through cursor strings.

## Error Handling

Returns 400 Bad Request with code INVALID_CURSOR on tampered tokens.

## Edge Cases

- Identical created_at timestamps (tie-broken by UUID id)

## Observability

Logs pagination depth and cursor decode failures.

## Tests Required

### Unit
- packages/backend/src/catalog/cursor.test.ts

### Integration
- Deep keyset pagination test against 1,000 seeded products

### End-to-End
- tests/e2e/product-list.spec.ts

### Security / Regression
- Assert tampered base64 cursor returns 400 instead of crashing

Do not mark the task complete until required tests pass.

## Manual Verification

Fetch page 1, extract nextCursor, fetch page 2; verify zero overlapping product IDs.

## Definition of Done

- [ ] Required skills inspected and activated
- [ ] Requirement behavior implemented
- [ ] Architecture rules followed
- [ ] Security requirements satisfied
- [ ] Tests added
- [ ] Relevant tests pass
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Documentation updated where required
- [ ] Requirement traceability updated
- [ ] Independent review completed according to risk
- [ ] No unresolved blocking review findings
- [ ] Manual verification completed when required

## Independent Review Requirement

Risk Level:
MEDIUM

Review requirements:
Single thorough review pass. Documented in docs/reviews/t022-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(catalog): implement stable keyset cursor pagination`

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
