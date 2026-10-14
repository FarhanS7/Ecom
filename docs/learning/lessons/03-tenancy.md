# Store isolation, ownership, and channel context

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T014–T018, T068–T069. Prerequisites: Identity lesson and SQL foreign keys.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/03-tenancy.md). Challenge-first: open that file now, use [hints](../hints/03-tenancy.md) only if needed, then compare [solution reasoning](../solutions/03-tenancy.md).

## Mental model

Tenant/store scope is an authorization condition carried through every operation. A shared marketplace can read public listings across stores; a seller cannot therefore read other sellers' operational data. One global user account can have several independent capabilities.

## Worked example

Alice shops globally and edits store A. Requesting store B's product ID with Alice's valid cookie must fail. If the UI hides store B but the API updates by product ID alone, the application still leaks authority.

```
// Repository contract sketch: scope cannot be omitted.
updateProduct(actorScope: { storeId: string; userId: string },
              productId: string, expectedVersion: number, patch: ProductPatch);
// SQL also includes WHERE store_id = $scope AND id = $id.
```

## Guided implementation

1. Create two stores with deliberately similar products and distinct staff.
2. Model membership independently from user identity and platform roles.
3. Require scoped IDs in repository ports; add composite foreign keys for product/variant/asset ownership.
4. Include channel/store in cache and search keys; validate publication for both results and facets.
5. Test scope substitution in API, invoice downloads, reports and cached responses, not just list pages.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Treating a URL store ID as permission; frontend-only filtering; granting platform admin because someone owns a store; forgetting scope on nested assets or counts; membership cached without revocation behavior.

## Explain it without looking

- Why does a public marketplace list not authorize a private seller report?
- Which foreign key prevents attaching another store's variant?
- What cache key would accidentally leak a store-only product?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Make U a shopper who has purchased from B; confirm their own order access does not grant B staff permissions.

## Reference

[Architecture decision: stores and channels](../../decisions/0003-stores-and-channels.md). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
