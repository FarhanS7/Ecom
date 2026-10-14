# Stores and staff authorization

Status: proposed module specification. Module ID: **stores**.

## Responsibility

Businesses, the one-store relationship, approval/suspension, invitations, memberships, scoped permissions, theme, and storefront content.

## Dependencies and boundary

Provider modules: identity.

resolveChannel(path) returns marketplace or an approved store. authorizeStore(actor,storeId,permission) returns a scoped capability. Invitations are one-use, expire, and require matching verified email. Owner cannot remove the last owner; ownership transfer is deferred.

## Invariants

A valid store ID is not proof of access. Suspended stores cannot publish new checkout lines. Historical paid orders remain available to customers and support. Staff order DTOs expose only own suborders; address/phone masked until paid.

## Acceptance scenarios

Store A staff guesses store B product/order/theme IDs: return 404 or deny without leakage. Removing membership invalidates permission cache immediately and tests old sessions. Invite acceptance twice cannot create a second membership.

## Out of scope

Separate identity databases, schema-per-tenant, multiple stores per business, arbitrary tenant JavaScript.

## Implementation and learning

Task range: T014–T016, T018, T068. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [03-tenancy lesson](../learning/lessons/03-tenancy.md), or attempt its [challenge](../learning/challenges/03-tenancy.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
