# TASK-040 — Build Seller Stock Management UI

## Status

COMPLETED

## Goal

Build Next.js seller console dashboard for inspecting variant inventory, reserved counts, and executing manual stock adjustments.

## Why This Task Exists

Enables vendors to monitor available stock, restock products, and review inventory ledger history.

## Requirement References

- IN-1
- IN-5
- PRD Section 5.1

## Dependencies

### Blocked By
- TASK-027
- TASK-037
- TASK-039

### Blocks
- TASK-067

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs seller console table layout, modal dialogs, and optimistic UI updates.
- Installation/activation required: No
- Instructions that apply to this task:
  - Display on_hand, reserved, and available columns explicitly
  - Show ledger history modal

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/seller/products/page.tsx`
- `packages/backend/src/inventory/inventory.service.ts`
- `apps/web/src/features/seller/actions.ts`

## Current Behavior

Seller console allows editing variant price and SKU, but displays no inventory counters or restocking controls.

## Required Behavior

Seller console displays variant stock table with On Hand, Reserved, Available; allows restocking via modal; shows movement audit log.

## Inputs / Outputs / Contracts

StockAdjustmentDto: { deltaOnHand: number, reason: string }. InventoryItemViewDto.

## Implementation Commands

Execute in this order:

1. Build SellerInventoryTable component in apps/web/src/features/seller/inventory-table.tsx.
2. Build StockAdjustmentModal client component with quantity input and reason selector.
3. Implement Next.js Server Action adjustStockAction validating input against contracts schema.
4. Build StockMovementsDrawer displaying variant ledger history.
5. Write component tests and form validation tests.

## Data / Database Changes

None directly from UI; calls backend adjustStock port.

## Security Requirements

Enforces store scoping: seller can view and adjust only their own store variants.

## Error Handling

Displays inline error if seller attempts to adjust stock below active reservations.

## Edge Cases

- Simultaneous adjustment and checkout reservation (UI reflects fresh version upon modal close)

## Observability

Telemetry on seller manual stock modifications.

## Tests Required

### Unit
- apps/web/src/features/seller/inventory-table.test.tsx (stock calculation, low-stock badge styling)

### Integration
- apps/web/src/features/seller/stock-adjustment.test.ts (server action validation, API call)

### End-to-End
- tests/e2e/seller-inventory.spec.ts (log in as seller, adjust stock from 10 to 25, verify updated table)

### Security / Regression
- Assert non-seller cannot view or submit stock adjustments

Do not mark the task complete until required tests pass.

## Manual Verification

Log into /seller/inventory; adjust variant stock by +50; verify available count increments immediately.

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
Single review pass. Documented in docs/reviews/t040-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build seller stock management table and adjustment dialog`

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
