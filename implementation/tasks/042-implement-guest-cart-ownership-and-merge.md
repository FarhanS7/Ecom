# TASK-042 — Implement Guest Cart Ownership and Merge

## Status

COMPLETED

## Goal

Build guest cart signing with HMAC tokens and atomic merge handler consolidating guest basket into customer cart upon login.

## Why This Task Exists

Enables anonymous visitors to shop before authenticating and guarantees zero lost basket items upon sign-in.

## Requirement References

- CA-2
- PRD Section 6.4

## Dependencies

### Blocked By
- TASK-041
- TASK-010

### Blocks
- TASK-043
- TASK-047

## Architecture References

- ARCHITECTURE.md -> Core correctness rules
- DECISIONS.md -> DEC-003
- docs/modules/cart.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs guest token signing and prevents cart tampering.
- Installation/activation required: No
- Instructions that apply to this task:
  - Sign guest cart ID with HMAC token
  - Prevent replay merge

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing merge scenarios with duplicate items before writing logic.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test merging items already in customer cart
  - Assert quantity capping at 99

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/cart/cart.service.ts`
- `packages/backend/src/identity/auth.service.ts`
- `docs/modules/cart.md`

## Current Behavior

Carts require authenticated customer; unauthenticated guests receive 401 Unauthorized.

## Required Behavior

Guests receive signed cookie cart_guest_token; POST /v1/carts/{channelKey}/merge merges guest items into user cart upon login and marks guest cart merged in cart_merges.

## Inputs / Outputs / Contracts

POST /v1/carts/{channelKey}/merge -> { mergedCart: CartDto }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0012-cart-merges.sql creating cart_merges table with UNIQUE(guest_cart_id).
2. Implement GuestTokenService signing and verifying guest cart cookies with HMAC-SHA256.
3. Build CartService.mergeGuestCart() consolidating line quantities (capped at 99).
4. Hook AuthService.login() to trigger cart merge if guest token cookie is present.
5. Write integration tests in tests/integration/cart-merge.spec.ts.

## Data / Database Changes

Creates cart_merges table in migration 0012-cart-merges.sql; updates cart_items.

## Security Requirements

Guest token verification prevents arbitrary cart takeover; repeated merge of same guest cart is rejected.

## Error Handling

Returns 400 Bad Request on tampered guest token; 409 if guest cart was already merged.

## Edge Cases

- Customer already has 5 of Variant A; guest cart has 10 of Variant A (merged quantity equals 15)
- Combined quantity exceeds 99 (capped at maximum allowed 99 units)

## Observability

Logs guest-to-customer cart merge events.

## Tests Required

### Unit
- packages/backend/src/cart/guest-merge.test.ts (quantity sum logic, 99 cap, deduplication)

### Integration
- tests/integration/cart-merge.spec.ts (add items as guest; log in; verify items merged into user cart; verify guest token deactivated)

### End-to-End
- None.

### Security / Regression
- Assert tampered guest cart signature is rejected with 401

Do not mark the task complete until required tests pass.

## Manual Verification

Add items as guest; log in via /login; verify cart drawer retains items with updated user badge.

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
Single thorough review pass focusing on token signing and duplicate merge idempotency. Documented in docs/reviews/t042-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(cart): implement guest cart signing and atomic customer cart merge`

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
