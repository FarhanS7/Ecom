# Review Context: TASK-049 (Persistent Mock Payment Provider)

## Review Metadata
- **Task ID**: `TASK-049`
- **Feature**: Persistent Mock Payment Provider with HMAC Signing & Deterministic Outcomes
- **Risk Level**: MEDIUM
- **Status**: APPROVED
- **Review Date**: 2026-11-16
- **Reviewer**: Senior Security Specialist & Backend Architect

---

## 1. Scope & Implementation Summary
Implemented a standalone, persistent mock payment simulator (`@shopscale/mock-payments`) located in `apps/mock-payments`:
1. **Shared Contracts** (`packages/contracts/src/payments.ts`):
   - Defined `mockChargeRequestSchema`, `mockChargeResponseSchema`, `paymentWebhookPayloadSchema`, and `paymentOutcomeSchema`.
   - All amounts enforced as integer cents strings (`amountCents: z.string().regex(/^\d+$/)`).
2. **Cryptographic Signing & Verification** (`apps/mock-payments/src/signer.ts`):
   - Cryptographic HMAC-SHA256 signing using Node `crypto.createHmac`.
   - Signed message payload format: `${timestamp}.${rawBody}`.
   - Timestamp headers: `X-ShopScale-Timestamp` (epoch ms) and `X-ShopScale-Signature` (64-char hex digest).
   - Timing-safe verification using `crypto.timingSafeEqual` over raw buffers of equal length to eliminate timing side channels.
   - 5-minute replay prevention tolerance window (`maxAgeMs = 300_000`).
3. **Attempt Ledger** (`apps/mock-payments/src/ledger.ts`):
   - In-memory persistent attempt store tracking `effectKey`, `providerRef`, `amountCents`, `currency`, `status`, `simulateOutcome`, and timestamps.
   - Idempotent deduplication: identical `effectKey` with same `amountCents` returns existing attempt without duplicate charge creation.
   - Conflict detection: reused `effectKey` with conflicting `amountCents` or `currency` throws `ConflictingEffectKeyError` (409 Conflict).
4. **Simulator Engine & Webhook Dispatcher** (`apps/mock-payments/src/simulator.ts`):
   - Deterministic outcome handling:
     - `SUCCESS`: schedules `payment.succeeded` webhook and transitions status to `SUCCEEDED`.
     - `DECLINED`: schedules `payment.failed` webhook and transitions status to `FAILED`.
     - `TIMEOUT`: retains `PENDING` status without immediate webhook dispatch to exercise reconciliation sweeps.
   - Configurable delay handling: respects `delayMs` via `setTimeout` or microtask dispatch.
   - Asynchronously dispatches signed HTTP POST webhooks to target receiver.
5. **Simulator HTTP Server** (`apps/mock-payments/src/server.ts`):
   - `POST /mock-payments/charges`: accepts charge intents and schedules callbacks.
   - `GET /mock-payments/charges/:effectKey`: returns attempt status for reconciliation.
   - `POST /mock-payments/reset`: resets ledger for clean test isolation.
   - `GET /health/live`: liveness probe.

---

## 2. Security & Architecture Review Checklist

### Webhook Signature & Tamper Resistance
- [x] Signatures are computed over raw bytes concatenated with timestamp (`${timestamp}.${rawBody}`).
- [x] Timing attacks prevented: `crypto.timingSafeEqual` used after buffer length equality check.
- [x] Expired timestamps (> 5 min) are rejected with `EXPIRED_TIMESTAMP`.
- [x] Tampered payload verification test: changing a single character in raw JSON fails with `INVALID_SIGNATURE`.

### Delay & Asynchrony Handling
- [x] Asynchronous dispatch does not block the HTTP response of `POST /mock-payments/charges` (returns 201 immediately with `providerRef`).
- [x] Webhook delivery errors are safely caught and tracked in `dispatchedWebhooks` without crashing the server process.

### Idempotency & Ledgers
- [x] Submitting identical effectKey multiple times returns 201 with the exact same `providerRef`.
- [x] Submitting conflicting amount for existing effectKey returns 409 `CONFLICTING_EFFECT_KEY`.

---

## 3. Test Verification
- `apps/mock-payments/src/signer.test.ts`: 9 unit tests passing.
- `packages/backend/tests/integration/mock-payments.spec.ts`: 8 integration tests passing against live HTTP server and webhook receiver.
- Monorepo full test suite: 510 unit tests passing (`pnpm test`).
- Monorepo full build: all 7 workspace packages/apps compile cleanly (`pnpm build`).
- Zero ESLint errors or warnings: `pnpm lint` passed cleanly.

**Verdict: APPROVED**
