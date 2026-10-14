# Sessions, token rotation, and browser security

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T009–T013, T017. Prerequisites: HTTP requests, cookies, hashing versus encryption, and a basic SQL transaction.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/02-identity.md). Challenge-first: open that file now, use [hints](../hints/02-identity.md) only if needed, then compare [solution reasoning](../solutions/02-identity.md).

## Mental model

Authentication answers who is calling; authorization answers whether that actor may do this operation. A JWT signature proves integrity of its claims, not that a current store membership still exists. Refresh rotation is a state machine: unused token → consumed token with one successor; reuse means a possible stolen credential.

## Worked example

Token R1 is exchanged for R2. If R1 arrives again, the server revokes that session family rather than issuing R3. Two browser tabs can accidentally race refresh, so the gateway/client session layer must serialize normal refresh attempts; the server still enforces the strict reuse rule.

```
// State transition sketch; execute under one DB transaction and row lock.
if (token.usedAt || family.revokedAt) return revokeFamilyAndReject();
markConsumed(token.id);
const successor = createHashedRefreshToken(family.id);
return successor;
```

## Guided implementation

1. Draw registration, login, refresh, logout, reset and verification separately.
2. Hash passwords with the selected password-hashing library; store refresh/reset token hashes and expiry.
3. Write reuse/expiry tests with a deterministic clock and independent concurrent requests.
4. Deliver tokens through secure HttpOnly cookies; add explicit Origin/CSRF checks for state-changing browser requests.
5. Build accessible forms with generic recovery messages and no credential persistence in browser storage.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Treating localStorage as a safe long-lived credential store; forgetting CSRF because cookies are HttpOnly; trusting roles forever from a stale token; using one token purpose for both reset and verification.

## Explain it without looking

- Why can HttpOnly cookies still require CSRF protection?
- What happens if a consumed refresh token arrives after logout?
- How can a valid JWT accompany a forbidden store mutation?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Revoke a store membership while the user's general shopping session remains valid; store editing must fail but their own order history remains accessible.

## Reference

[Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
