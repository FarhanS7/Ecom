# TASK-037 — Model Stock Invariants and Movement Ledger

## Status

COMPLETED

## Goal

Author Drizzle schema and migrations for inventory, stock_reservations, and append-only stock_movements ledger with strict SQL check constraints.

## Why This Task Exists

Establishes physical database invariants guaranteeing available stock can never become negative and providing complete accounting auditability.

## Requirement References

- IN-1
- IN-4
- G2
- PRD Section 6.3

## Dependencies

### Blocked By
- TASK-003
- TASK-019

### Blocks
- TASK-038
- TASK-039
- TASK-040
- TASK-044

## Architecture References

- ARCHITECTURE.md -> Inventory
- DECISIONS.md -> DEC-005
- docs/modules/inventory.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: domain-modeling
- Skill: domain-modeling
- Location: `skills/skills-main/skills/engineering/domain-modeling/SKILL.md`
- Why required: Governs designing invariant check constraints and append-only ledgers.
- Installation/activation required: No
- Instructions that apply to this task:
  - Add CHECK (on_hand >= 0)
  - Add CHECK (reserved >= 0 AND reserved <= on_hand)
  - Enforce append-only ledger

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Ensures database check constraints are tested with failing scenarios first.
- Installation/activation required: No
- Instructions that apply to this task:
  - Write test asserting negative stock update throws check_violation
  - Assert ledger uniqueness

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/schema.ts`
- `db/migrations/0006-catalog.sql`
- `docs/architecture/data-model.md`

## Current Behavior

Not implemented. Variant records exist without physical inventory tracking, reservations, or ledger history.

## Required Behavior

Database schema enforces inventory constraints; available stock is dynamically derived (on_hand - reserved); stock_movements records every delta with unique operation_key.

## Inputs / Outputs / Contracts

inventory: (variant_id PK, on_hand int, reserved int, version int). stock_movements: (id PK, variant_id FK, delta_on_hand int, delta_reserved int, reason text, operation_key text, ref_id text, created_at timestamptz).

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0010-inventory.sql creating inventory, stock_reservations, and stock_movements tables.
2. Add CHECK constraints: 0 <= reserved AND reserved <= on_hand AND on_hand >= 0.
3. Add unique constraint on stock_movements(operation_key, variant_id, reason).
4. Define Drizzle schemas in packages/backend/src/inventory/schema.ts.
5. Write schema constraint integration test tests/integration/inventory-schema.spec.ts.

## Data / Database Changes

Creates inventory, stock_reservations, and stock_movements tables in migration 0010-inventory.sql.

## Security Requirements

Inventory mutations restricted to internal application ports and verified seller/admin workflows.

## Error Handling

SQL CHECK violations throw typed InventoryConstraintError (23514 check_violation).

## Edge Cases

- Attempting to set reserved greater than on_hand via manual adjustment (rejected by DB constraint)

## Observability

Migration log confirmation.

## Tests Required

### Unit
- packages/backend/src/inventory/schema.test.ts (invariants, field definitions)

### Integration
- tests/integration/inventory-schema.spec.ts (verify negative stock rejected; verify reserved > on_hand rejected; verify movement ledger uniqueness)

### End-to-End
- None.

### Security / Regression
- Verify inventory table cannot be altered without passing through transactional port

Do not mark the task complete until required tests pass.

## Manual Verification

Execute psql command: INSERT INTO inventory (variant_id, on_hand, reserved) VALUES ('...', 10, 15); verify PostgreSQL rejects with CHECK constraint violation.

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
Multiple review passes on PostgreSQL CHECK constraints and ledger deduplication keys. Follow PRD_TO_TASKS_FRAMEWORK Phase 2.5.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(inventory): model stock invariants reservations and movement ledger`

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
