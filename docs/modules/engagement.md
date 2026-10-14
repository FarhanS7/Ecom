# Reviews and wishlists

Status: proposed module specification. Module ID: **engagement**.

## Responsibility

Verified-purchase reviews, moderation state, aggregate update events, and global customer wishlist.

## Dependencies and boundary

Provider modules: commerce, catalog.

createReview(actor,productId,orderItemId,rating,body) checks a delivered eligible purchase; wishlist operations are idempotent PUT/DELETE. Rating projection recomputes or applies deduped version-safe changes.

## Invariants

One review per user/product across channels. Only own review can edit. Hidden/unpublished products do not leak through wishlist responses. Review counts reflect approved reviews. A refunded review retains honest provenance rather than silently disappearing.

## Acceptance scenarios

Buyer in store A cannot submit review using another user's order item. Duplicate review creation conflicts. Editing rating twice and replaying events leaves accurate sum/count. Wishlist never changes stock or cart.

## Out of scope

Anonymous reviews, paid-review incentives, social networking.

## Implementation and learning

Task range: T064–T065. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [10-frontend lesson](../learning/lessons/10-frontend.md), or attempt its [challenge](../learning/challenges/10-frontend.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
