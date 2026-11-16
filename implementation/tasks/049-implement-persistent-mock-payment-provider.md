# TASK-049 — Implement Persistent Mock Payment Provider

## Status

COMPLETED

## Goal

Build standalone/co-located mock payment HTTP simulator supporting charges, deterministic delays, simulated declines, and HMAC-SHA256 signed webhook callbacks.

## Why This Task Exists

Enables completely realistic payment integration, webhook testing, and failure compensation without requiring live third-party accounts.

## Requirement References

- OR-3
- G3
- PRD Section 1.3
- PRD Section 6.5

## Dependencies

### Blocked By
- TASK-002
- TASK-005

### Blocks
- TASK-050
- TASK-052

## Architecture References

- ARCHITECTURE.md -> Integrations
- DECISIONS.md -> DEC-008
- docs/modules/payments.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs payment intent contracts and signed webhook payloads.
- Installation/activation required: No
- Instructions that apply to this task:
  - Simulate asynchronous payment outcomes
  - Sign callbacks with HMAC-SHA256

### Skill 2: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Enforces cryptographic signing over raw bytes with timestamp headers.
- Installation/activation required: No
- Instructions that apply to this task:
  - Include X-ShopScale-Timestamp
  - Compute signature over timestamp + '.' + rawBody

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/config/src/env.ts`
- `packages/contracts/src/errors.ts`
- `docs/modules/payments.md`

## Current Behavior

Not implemented. No payment simulator service exists; no signed webhooks can be generated.

## Required Behavior

POST /mock-payments/charges accepts charge requests; records attempt in mock ledger; asynchronously fires POST /v1/webhooks/payments signed with HMAC-SHA256 after configurable delay.

## Inputs / Outputs / Contracts

MockChargeRequestDto: { effectKey: string, amountCents: string, currency: 'USD', returnUrl: string, simulateOutcome?: 'SUCCESS' | 'DECLINED' | 'TIMEOUT' }. WebhookPayload: { eventId: string, type: 'payment.succeeded' | 'payment.failed', effectKey: string, amountCents: string, providerRef: string, timestamp: number }.

## Implementation Commands

Execute in this order:

1. Implement mock payment simulator in apps/mock-payments/ (or nested Nest module).
2. Build persistent ledger in memory or SQLite/PG tracking effect keys.
3. Implement WebhookDispatcher signing raw JSON body with HMAC-SHA256 using WEBHOOK_SECRET.
4. Support deterministic simulation flags in request body or headers.
5. Write integration tests in tests/integration/mock-payments.spec.ts.

## Data / Database Changes

None in primary database; maintains standalone mock payment ledger.

## Security Requirements

Webhook signing secret validated at boot; signatures generated using crypto.createHmac.

## Error Handling

Returns 400 on missing effectKey; 409 on reused effectKey with conflicting amount.

## Edge Cases

- Simulated network timeout (simulator delays webhook by 10 seconds to test reconciliation)

## Observability

Simulator access logs detailing dispatched webhook events and status codes.

## Tests Required

### Unit
- apps/mock-payments/src/signer.test.ts (HMAC signature calculation, timestamp concatenation)

### Integration
- tests/integration/mock-payments.spec.ts (submit charge, receive signed webhook, assert valid signature)

### End-to-End
- None.

### Security / Regression
- Assert tampering with webhook payload invalidates signature check

Do not mark the task complete until required tests pass.

## Manual Verification

Trigger test charge via curl; verify simulator logs print dispatched webhook with 200 OK acknowledgment.

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
MEDIUM

Review requirements:
Single thorough review pass focusing on webhook signature generation and delay handling. Documented in docs/reviews/t049-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(payments): implement persistent mock payment simulator with hmac signing`

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
