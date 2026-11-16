# TASK-041 — Implement Durable Channel Carts

## Status

COMPLETED

## Goal

Build CartService with Redis-backed speed and persistent PostgreSQL sync supporting channel-scoped baskets.

## Why This Task Exists

Provides sub-60ms cart mutations while ensuring logged-in customer carts survive Redis restarts.

## Requirement References

- CA-1
- G1
- NFR-005
- PRD Section 6.4

## Dependencies

### Blocked By
- TASK-003
- TASK-009
- TASK-019

### Blocks
- TASK-042
- TASK-043
- TASK-047

## Architecture References

- ARCHITECTURE.md -> Data Ownership
- DECISIONS.md -> DEC-003
- docs/modules/cart.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Ensures Redis/PostgreSQL synchronization is tested with restart scenarios.
- Installation/activation required: No
- Instructions that apply to this task:
  - Flush Redis and assert cart recovers from PostgreSQL
  - Enforce channelKey isolation

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs cart REST endpoints under /v1/carts/{channelKey}.
- Installation/activation required: No
- Instructions that apply to this task:
  - Validate max quantity (99)
  - Separate marketplace and store cart state

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/read.service.ts`
- `db/migrations/0006-catalog.sql`
- `docs/modules/cart.md`

## Current Behavior

Not implemented. No cart tables, Redis keys, or cart management endpoints exist.

## Required Behavior

Customers and guests manage channel-scoped carts; mutations write to PostgreSQL and update Redis snapshot; GET /v1/carts/{channelKey} returns current items with live catalog prices.

## Inputs / Outputs / Contracts

CartDto: { id: string, channelKey: string, items: Array<{ variantId: string, qty: number, title: string, priceCents: string, available: boolean }>, totalCents: string, version: number }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0011-carts.sql creating carts and cart_items tables.
2. Enforce channel_key = 'marketplace' OR store UUID via partial indexes.
3. Implement CartService in packages/backend/src/cart/cart.service.ts with add, update, remove, and get.
4. Sync cart state to Redis key cart:{channelKey}:{ownerId} with 30-day TTL.
5. Expose GET, POST, PATCH, DELETE endpoints in CartController.
6. Write integration tests in tests/integration/cart.spec.ts.

## Data / Database Changes

Creates carts and cart_items tables in migration 0011-carts.sql.

## Security Requirements

Enforces cart ownership: user can read/modify only their own cart; store cart cannot contain products from another store.

## Error Handling

Returns 400 Bad Request if quantity exceeds 99; 404 if variant does not exist.

## Edge Cases

- Adding product variant to store cart that belongs to a different store (rejected with 400 STORE_MISMATCH)
- Product price changes after adding to cart (cart endpoint dynamically computes totals using live variant prices)

## Observability

Cart modification duration metrics; tracks active cart count.

## Tests Required

### Unit
- packages/backend/src/cart/cart.service.test.ts (quantity bounding, item deduplication, totals calculation)

### Integration
- tests/integration/cart.spec.ts (add item, update qty, delete item, verify Redis snapshot, flush Redis and assert DB reload)

### End-to-End
- None.

### Security / Regression
- Assert customer cannot read another user's cart

Do not mark the task complete until required tests pass.

## Manual Verification

Add item to marketplace cart via curl; query Redis CLI GET cart:marketplace:{userId}; verify JSON snapshot matches.

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
Single thorough review pass focusing on dual-write consistency between Redis and PostgreSQL. Documented in docs/reviews/t041-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(cart): implement durable channel carts with redis caching and postgres persistence`

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
