# TASK-050 — Implement Payment Dispatch and Webhook Ingestion

## Status

COMPLETED

## Goal

Build payment-dispatch worker consuming CheckoutReserved outbox events, and implement POST /v1/webhooks/payments validating HMAC signatures and deduplicating events.

## Why This Task Exists

Completes the asynchronous payment processing pipeline while guaranteeing zero duplicate processing of webhook retries.

## Requirement References

- OR-3
- G3
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-029
- TASK-047
- TASK-049

### Blocks
- TASK-051
- TASK-052
- TASK-054

## Architecture References

- ARCHITECTURE.md -> Synchronous vs Asynchronous
- DECISIONS.md -> DEC-008
- docs/modules/payments.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Enforces timing-safe HMAC signature verification over raw request buffers.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use crypto.timingSafeEqual
  - Validate timestamp tolerance (5 min)
  - Capture raw body buffer

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing invalid signatures and duplicate webhook replays before writing handler.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test expired webhook timestamp
  - Test modified body signature failure

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/api/src/main.ts`
- `packages/backend/src/platform/security.ts`
- `docs/modules/payments.md`

## Current Behavior

Not implemented. CheckoutReserved events are unconsumed; webhook endpoint does not exist.

## Required Behavior

Worker calls payment provider for CheckoutReserved events; POST /v1/webhooks/payments validates signature, deduplicates in webhook_events, and writes PaymentObserved outbox event in single transaction.

## Inputs / Outputs / Contracts

webhook_events: (provider text, event_id text, payload_hash text, payload JSONB, received_at timestamptz, processed_at timestamptz, status text, PRIMARY KEY(provider, event_id)).

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0015-webhooks.sql creating webhook_events table.
2. Configure Fastify raw body parsing plugin on /v1/webhooks/payments.
3. Implement WebhookSignatureGuard validating X-ShopScale-Timestamp and X-ShopScale-Signature.
4. Build WebhookService deduplicating events against webhook_events table.
5. Write PaymentObserved event to transactional outbox.
6. Build PaymentDispatchWorker in apps/worker/src/consumers/payment-dispatch.consumer.ts.
7. Write integration tests in tests/integration/payment-webhooks.spec.ts.

## Data / Database Changes

Creates webhook_events table in migration 0015-webhooks.sql; inserts outbox.

## Security Requirements

Rejects webhook calls with invalid signatures (401) or expired timestamps > 5 min (400); timing attack resistant.

## Error Handling

Duplicate webhook event ID with identical payload returns 200 OK without re-processing; duplicate ID with altered payload is quarantined with 409 Conflict.

## Edge Cases

- Webhook arrives before payment-dispatch worker finishes recording payment_attempt (attempt is lazily created or upserted)

## Observability

Logs webhook receipts; records payment_webhook_latency_seconds.

## Tests Required

### Unit
- packages/backend/src/payments/signature-validator.test.ts (timing-safe comparison, timestamp window, signature mismatch)

### Integration
- tests/integration/payment-webhooks.spec.ts (valid webhook processed; duplicate webhook deduped; invalid signature rejected)

### End-to-End
- None.

### Security / Regression
- Replay webhook with timestamp > 10 minutes old; assert 400 TIMESTAMP_EXPIRED
- Modify 1 character of webhook JSON; assert 401 INVALID_SIGNATURE

Do not mark the task complete until required tests pass.

## Manual Verification

Deliver signed webhook via curl; verify webhook_events row inserted and outbox contains PaymentObserved event.

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
HIGH

Review requirements:
Multiple review passes on raw buffer capturing, HMAC verification, and deduplication logic. Documented in docs/reviews/t050-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(payments): implement hmac webhook verification and event deduplication`

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
