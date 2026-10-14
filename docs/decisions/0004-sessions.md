# ADR-0004: Cookie-carried access tokens and rotating refresh tokens

## Status

Proposed. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

The PRD requests JWT access plus refresh rotation; the browser application needs same-origin sessions without browser-readable long-lived tokens.

## Decision

Use secure HttpOnly cookies in deployed environments, SameSite policy, CSRF/Origin checks for mutations, 15-minute access tokens, rotating hashed refresh tokens, and durable family revocation. Scope cookies to the shared demo origin.

## Alternatives considered

localStorage refresh tokens expand token exposure to script execution. Cross-domain cookie tricks do not safely implement future custom-domain SSO.

## Consequences

Refresh serialization and family-reuse policy need careful tests. Cookie transport does not remove CSRF risk. Sensitive actions query current membership/policy.

## Validation

Rotation race, stale membership, logout, CSRF, reset expiry, and no token in logs.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
