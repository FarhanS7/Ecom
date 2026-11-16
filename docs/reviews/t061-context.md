# Independent Review: TASK-061 — Implement Invoices and Demo Notifications

## Review Metadata
- **Task ID**: `TASK-061`
- **Goal**: Asynchronous invoice PDF generation stored in MinIO and simulated demo email/SMS notifications upon order payment.
- **Risk Level**: LOW
- **Requirements Covered**: `OR-7`, `AD-3`, PRD Section 6.5, PRD Section 6.7
- **Date**: 2026-11-16
- **Status**: APPROVED

---

## 1. Scope & Artifacts Inspected

### Migrations
- `db/migrations/0020-notifications.sql`: Creates `invoices` and `notification_deliveries` tables with strict constraints, foreign keys, and indexes.

### Domain Models & Services
- `packages/backend/src/platform/storage.service.ts`: Added `putObject` and `getPresignedGetUrl` (default 15 minutes expiration) to `StoragePort` and `S3StorageService`.
- `packages/backend/src/notifications/schema.ts`: Drizzle schema for `invoices` and `notification_deliveries`.
- `packages/backend/src/notifications/errors.ts`: `InvoiceNotFoundError`, `InvoiceForbiddenError`, `InvoiceNotReadyError`.
- `packages/backend/src/notifications/notification.service.ts`: Delivery ledger service with idempotency enforcement (`effect_key`) and demo sink.
- `packages/backend/src/notifications/invoice.service.ts`: Assembles multi-vendor `OrderInvoiceData`, saves invoice records, and issues authenticated presigned download URLs.

### Worker & Document Generation
- `apps/worker/package.json`: Added `pdfkit` dependency and `@types/pdfkit`.
- `apps/worker/src/documents/invoice.generator.ts`: PDFKit invoice generator with sanitization, currency formatting, multi-page layout protection, and line-item table headers.
- `apps/worker/src/consumers/order-paid.consumer.ts`: BullMQ consumer processing `order.paid` domain events, generating PDF, uploading to MinIO, and recording notifications.
- `apps/worker/src/consumers/domain-events.consumer.ts`: Wired `order.paid` dispatch to `OrderPaidConsumer`.

### API & Contracts
- `packages/contracts/src/orders.ts`: Added `invoiceDtoSchema` and `InvoiceDto`.
- `apps/api/src/orders.controller.ts`: Added `GET /v1/orders/:id/invoice` with customer session auth, owner-scoping, and generic 404 on foreign IDs.
- `apps/web/src/lib/api.ts`: Allowed gateway path template `v1/orders/{id}/invoice`.
- `packages/backend/src/platform/route-policy.ts`: Added `/v1/orders/{id}/invoice` route policy.
- `docs/openapi.json`: Documented `/v1/orders/{id}/invoice` endpoint.

### Tests
- `apps/worker/src/documents/invoice.generator.test.ts`: Single-item orders, 10-item 3-vendor multi-page overflow, and untrusted string escaping.
- `apps/worker/src/consumers/order-paid.consumer.test.ts`: Event consumption, PDF generation, MinIO upload, DB record, and notification dispatch.
- `apps/api/src/orders.controller.test.ts`: Owner access, foreign access rejection (404), unauthenticated rejection (401), and privileged staff bypass.
- `packages/backend/tests/integration/invoice-worker.spec.ts`: End-to-end integration test with database and storage mock.

---

## 2. Invariant Checklist

| Invariant | Status | Verification Detail |
|---|---|---|
| Asynchronous PDF generation | PASS | Handled in background worker consumer upon `order.paid` event; never blocks checkout thread. |
| Object Storage Determinism | PASS | Stored under deterministic S3 key `invoices/{orderId}.pdf`. |
| Presigned URL Expiry | PASS | `getPresignedGetUrl` default TTL is 900 seconds (15 minutes). |
| Customer PII / Authorization Scope | PASS | Customer can only download invoices for orders they own. Foreign order ID returns 404 (no enumeration oracle). Privileged support/admin granted access. |
| Text Sanitization | PASS | Control characters stripped; no remote URLs loaded; standard Helvetica font used. |
| Table Pagination / Overflow | PASS | Evaluates `doc.y` against page height minus margins; adds new page and redraws header for large orders. |
| Notification Idempotency | PASS | Unique `effect_key` (`notif:email:order_paid:${orderId}`); duplicate retries return `alreadyDelivered: true` without double sending. |

---

## 3. Finding & Resolution
- **Finding**: In `apps/api/src/orders.controller.ts`, `isPrivileged` evaluated to `undefined` when `roles` array was not present on the actor object.
- **Resolution**: Wrapped the logical expression with `Boolean(...)` ensuring strict boolean typing (`true` or `false`). Unit test added asserting correct parameter passing.

---

## 4. Conclusion
The implementation of TASK-061 complies with all architectural, security, and functional requirements. Approved for completion.
