# TASK-061 — Implement Invoices and Demo Notifications

## Status

COMPLETED

## Goal

Build asynchronous worker jobs generating PDF invoices stored in MinIO and delivering simulated order confirmation emails/SMS.

## Why This Task Exists

Provides professional post-purchase documents and notifications without blocking the checkout HTTP thread.

## Requirement References

- OR-7
- AD-3
- PRD Section 6.5
- PRD Section 6.7

## Dependencies

### Blocked By
- TASK-029
- TASK-051

### Blocks
- TASK-073

## Architecture References

- ARCHITECTURE.md -> Synchronous vs Asynchronous
- docs/modules/notifications.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs invoice document generation and notification delivery ledger schemas.
- Installation/activation required: No
- Instructions that apply to this task:
  - Store invoices in MinIO/S3
  - Record notification deliveries in local ledger

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing background worker consumer execution and PDF generation.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test OrderPaid event triggers invoice generation
  - Verify retry backoff on MinIO failure

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/platform/storage.service.ts`
- `apps/worker/src/main.ts`
- `docs/modules/notifications.md`

## Current Behavior

Not implemented. Paid orders do not produce invoices or trigger customer notification deliveries.

## Required Behavior

On OrderPaid event, worker generates PDF invoice using PDFKit, uploads to MinIO, records notification in notification_deliveries, and provides secure download URL.

## Inputs / Outputs / Contracts

notification_deliveries: (id PK, effect_key text UNIQUE, user_id FK, channel text, template text, status text, attempts int, created_at timestamptz).

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0019-notifications.sql creating notification_deliveries and invoices tables.
2. Implement PDFInvoiceGenerator in apps/worker/src/documents/invoice.generator.ts using pdfkit.
3. Upload generated PDF stream to MinIO under invoices/{orderId}.pdf.
4. Build NotificationService recording simulated email/SMS delivery in notification_deliveries table.
5. Wire BullMQ consumer in apps/worker/src/consumers/order-paid.consumer.ts.
6. Expose GET /v1/orders/:id/invoice issuing presigned download URL.
7. Write integration tests in tests/integration/invoice-worker.spec.ts.

## Data / Database Changes

Creates notification_deliveries and invoices tables in migration 0019-notifications.sql.

## Security Requirements

Invoice downloads require verified order owner credentials; URLs expire after 15 minutes.

## Error Handling

Storage upload failures trigger BullMQ exponential retry up to 5 attempts before routing to dead-letter queue.

## Edge Cases

- Order with 10 line items across 3 sellers (PDF layout renders clean multi-page invoice without text clipping)

## Observability

Tracks PDF generation duration and MinIO upload latency.

## Tests Required

### Unit
- apps/worker/src/documents/invoice.generator.test.ts (PDF generation, line item totals formatting)

### Integration
- tests/integration/invoice-worker.spec.ts (publish OrderPaid event; worker runs; verify PDF exists in MinIO and delivery logged in DB)

### End-to-End
- None.

### Security / Regression
- Assert customer cannot download invoice belonging to another user

Do not mark the task complete until required tests pass.

## Manual Verification

Complete checkout; download PDF invoice via browser; open PDF and verify order items, seller details, and totals.

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
Single review pass focusing on PDF formatting and storage presigned URL security. Documented in docs/reviews/t061-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(worker): implement pdf invoice generation and local notification dispatch`

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
