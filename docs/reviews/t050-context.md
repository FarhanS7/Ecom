# Review Context: TASK-050 (Payment Dispatch and Webhook Ingestion)

## Review Metadata
- **Task ID**: `TASK-050`
- **Feature**: Payment Dispatch Worker & Webhook Ingestion with HMAC Verification and Idempotency Ledger
- **Risk Level**: HIGH
- **Status**: APPROVED
- **Review Date**: 2026-11-16
- **Reviewer**: Principal Security Specialist & Distributed Systems Architect

---

## 1. Scope & Implementation Summary
Implemented the asynchronous payment dispatch consumer and secure webhook ingestion endpoint:
1. **Webhook Deduplication Ledger & Migration** (`db/migrations/0016-webhooks.sql`):
   - Table `webhook_events` with composite primary key `(provider, event_id)` for guaranteed idempotency across retries.
   - Column `payload_hash` (SHA-256) detects payload alterations.
   - Status tracking (`received`, `processed`, `quarantined`) with descending index on `received_at`.
2. **Timing-Safe HMAC Signature Validator** (`packages/backend/src/payments/signature-validator.ts`):
   - Validates `X-ShopScale-Timestamp` and `X-ShopScale-Signature`.
   - Replay protection: enforces 5-minute maximum tolerance (`toleranceMs = 300_000`) for past/future timestamps.
   - Timing attack resistance: uses `crypto.timingSafeEqual` after strictly matching buffer byte lengths.
   - Operates strictly over raw request payload buffer / string.
3. **Webhook Ingestion Service** (`packages/backend/src/payments/webhook.service.ts`):
   - Atomic database transaction deduplicating on `(provider, event_id)`.
   - If event ID exists with matching hash: returns `{ status: 'duplicate' }` (200 OK) without re-executing business logic.
   - If event ID exists with altered hash: marks event `quarantined` and raises `WebhookQuarantineConflictError` (409 Conflict).
   - Updates `payment_attempts` table (`PAID` or `FAILED`) with `provider_ref`.
   - Writes `order.payment_observed` domain event to transactional outbox.
4. **Fastify Webhook Controller** (`apps/api/src/webhook.controller.ts` & `apps/api/src/main.ts`):
   - Configured `NestFastifyApplication` with `{ rawBody: true }` to retain unaltered payload buffer for HMAC calculation.
   - Handled route `POST /v1/webhooks/payments` classified as `public` in `ROUTE_POLICY`.
   - Synchronized OpenAPI documentation in `docs/openapi.json`.
5. **Payment Dispatch Consumer** (`apps/worker/src/consumers/payment-dispatch.consumer.ts`):
   - Consumes `order.checkout_reserved` outbox events from BullMQ queue `domain-events`.
   - Inserts `payment_attempts` with `status: 'PENDING'`.
   - Dispatches charge request to mock payment provider (`POST /mock-payments/charges`).
   - Updates `payment_attempts` with gateway `provider_ref`.

---

## 2. Security & Invariant Verification Checklist

### Cryptographic Security & Timing Attack Prevention
- [x] Webhook signatures are verified using `crypto.timingSafeEqual`.
- [x] Buffer length check precedes `timingSafeEqual` to avoid length leakage.
- [x] Timestamps older than 5 minutes or drifted into the future are rejected with 400 (`ExpiredTimestampError`).
- [x] Missing signature or timestamp headers are rejected with 400 (`MissingSignatureHeadersError`).
- [x] Invalid or tampered signatures are rejected with 401 (`InvalidSignatureError`).

### Idempotency & Replay Resistance
- [x] Primary key constraint `(provider, event_id)` on `webhook_events` prevents race conditions.
- [x] Duplicate webhooks with identical payload return 200 `{ status: 'duplicate' }` without duplicating outbox events.
- [x] Reused event IDs with altered payload are quarantined with 409 Conflict (`WebhookQuarantineConflictError`).

### Financial Invariants
- [x] All amounts strictly maintained as integer cents.
- [x] Payment attempts link to parent order via foreign key with status tracking (`PENDING`, `PAID`, `FAILED`).
- [x] Payment completion events emitted to transactional outbox in same transaction as attempt update.

---

## 3. Test Coverage Summary
- `packages/backend/src/payments/signature-validator.test.ts`: 9 unit tests passing.
- `packages/backend/src/payments/webhook.service.test.ts`: 3 unit tests passing.
- `apps/api/src/webhook.controller.test.ts`: 7 unit tests passing.
- `apps/worker/src/consumers/payment-dispatch.consumer.test.ts`: 4 unit tests passing.
- `packages/backend/tests/integration/payment-webhooks.spec.ts`: 10 integration tests passing.

---

## 4. Verdict
APPROVED. All security, idempotency, and financial invariants verified. Ready for saga orchestrator (TASK-051).
