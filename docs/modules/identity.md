# Identity and sessions

Status: proposed module specification. Module ID: **identity**.

## Responsibility

Global user account, access/refresh sessions, verification, password reset, login throttling, owned address book, and platform roles.

## Dependencies and boundary

Provider modules: platform.

authenticate(cookie) returns Actor with userId, sessionFamilyId, and platform role claims. Store memberships are queried from stores, not trusted from stale JWT claims. Access token TTL 15 minutes; refresh tokens rotate once per use with family reuse detection.

## Invariants

Store token hashes only. Refresh rotation locks the token row; one request succeeds, reuse revokes family. Browser gateway serializes refresh per session to avoid accidental concurrent refresh. Family revocation is checked for protected requests. Logout invalidates family; reset revokes sessions.

## Acceptance scenarios

A stolen used refresh token revokes the family; expired reset links cannot be reused; email request endpoints do not disclose account existence. Authenticated users may also be store staff without losing shopper permissions.

## Out of scope

Social login, passkeys, custom-domain SSO, and production MFA rollout (roadmap).

## Implementation and learning

Task range: T009–T013, T017–T018, T091. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [02-identity lesson](../learning/lessons/02-identity.md), or attempt its [challenge](../learning/challenges/02-identity.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
