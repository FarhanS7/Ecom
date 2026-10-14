# Channel carts

Status: proposed module specification. Module ID: **cart**.

## Responsibility

Durable channel-scoped carts, versioned Redis snapshots, guest ownership, login merge, and price/availability feedback.

## Dependencies and boundary

Provider modules: catalog, identity.

loadCart(owner,channel); setQuantity(owner,channel,variant,qty,expectedVersion); mergeGuestCart(user,guestProof,channel). Cart computes display estimates; commerce recomputes authoritative payable totals.

## Invariants

Exactly one owner type (user or random guest token hash). Store carts reject foreign-store variants. Database commit precedes Redis refresh. Cache keys include owner, channel, schema version and cart version. Guest merges are idempotent and cannot cross channels.

## Acceptance scenarios

Adding in store A does not change marketplace cart. Login merge sums quantities up to 99 and reports adjustments. Redis flush reconstructs the same authenticated cart. Unavailable lines remain visible with actionable removal/change messages.

## Out of scope

Stock reservation merely by adding to cart; guest checkout; one universal basket.

## Implementation and learning

Task range: T041–T044. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [06-carts lesson](../learning/lessons/06-carts.md), or attempt its [challenge](../learning/challenges/06-carts.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
