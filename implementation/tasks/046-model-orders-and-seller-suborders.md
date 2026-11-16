# TASK-046 — Model Orders and Seller Suborders

## Status

COMPLETED

## Goal

Author Drizzle schema and migrations for orders, seller_orders, order_items, and payment_attempts with immutable historical snapshots.

## Why This Task Exists

Provides relational foundation for multi-seller checkout, independent vendor fulfillment, and payment tracking.

## Requirement References

- OR-2
- OR-6
- PRD Section 8
- REQ-COMM-001

## Dependencies

### Blocked By
- TASK-003
- TASK-014
- TASK-019

### Blocks
- TASK-047
- TASK-051
- TASK-055
- TASK-056

## Architecture References

- ARCHITECTURE.md -> Data Model
- DECISIONS.md -> DEC-011
- docs/architecture/data-model.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: domain-modeling
- Skill: domain-modeling
- Location: `skills/skills-main/skills/engineering/domain-modeling/SKILL.md`
- Why required: Governs multi-tenant order hierarchy and immutable snapshotting.
- Installation/activation required: No
- Instructions that apply to this task:
  - Snapshot variant title, SKU, price, address
  - FKs must use ON DELETE RESTRICT

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `db/migrations/0002-stores.sql`
- `db/migrations/0006-catalog.sql`
- `docs/architecture/data-model.md`

## Current Behavior

Not implemented. No order tables exist; customer checkout cannot be stored.

## Required Behavior

PostgreSQL schema models parent orders, child seller_orders (one per vendor), order_items, and payment_attempts with status constraints and RESTRICT foreign keys.

## Inputs / Outputs / Contracts

orders, seller_orders, order_items, payment_attempts Drizzle schemas in @shopscale/backend.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0013-orders.sql creating orders, seller_orders, order_items, and payment_attempts tables.
2. Enforce status ENUMs: payment_status (PENDING, PAID, FAILED, REFUNDED), fulfillment_status (PENDING, PACKED, SHIPPED, DELIVERED, CANCELLED).
3. Add composite foreign key: seller_orders(order_id, store_id).
4. Add indexes on (user_id, created_at DESC) and (store_id, created_at DESC).
5. Write schema constraint integration test tests/integration/orders-schema.spec.ts.

## Data / Database Changes

Creates orders, seller_orders, order_items, and payment_attempts tables in migration 0013-orders.sql.

## Security Requirements

Enforces ON DELETE RESTRICT: historical order records cannot be deleted even if products or stores are archived.

## Error Handling

Schema check constraints prevent invalid order totals or negative prices.

## Edge Cases

- Order containing 1 seller (exactly 1 parent order, 1 seller suborder created)
- Order containing 5 sellers (1 parent order, 5 distinct seller suborders created)

## Observability

Migration log confirmation.

## Tests Required

### Unit
- packages/backend/src/commerce/schema.test.ts (relations, status transitions, snapshot fields)

### Integration
- tests/integration/orders-schema.spec.ts (insert parent order and suborders; verify composite FK; verify delete restriction)

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Inspect PostgreSQL schema via psql: \d orders; verify foreign keys and status constraints.

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
Single thorough review pass focusing on immutable snapshot fields and suborder relationships. Documented in docs/reviews/t046-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(commerce): model orders seller suborders and payment attempts`

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
