# Review context — T019: Model products and variants

Branch: `feature/catalog/t019-model-products-and-variants` (parent task;
linked subtasks T019a/T019b per the scope rule).

## Changed files

T019a (`765ccd4`): `db/migrations/0006-catalog.sql` (reviewed; numbering
drift from the task file's provisional `0004` recorded — 0004/0005 were
taken by themes/addresses), `packages/backend/src/catalog/schema.ts`
(dependency-free drizzle mirror + entry in `db/drizzle.config.ts`),
`catalog/schema.test.ts` tripwires, T019a/T019b subtask docs.

T019b (this commit): `catalog/category.service.ts` (create/re-parent/
delete/list with advisory-locked cycle rejection + one-statement subtree
path rewrite), `catalog/category.service.test.ts` (pure helpers),
`packages/backend/tests/integration/catalog-schema.spec.ts` (placement
mirrors T014a's store-scope.spec — schema boundaries need no HTTP;
subtask doc amended to match).

## Behavior

- Cross-store variants are impossible at the DB boundary:
  `product_variants` carries `store_id` + composite FK
  `(store_id, product_id) → products(store_id, id)`; a variant naming
  another store's product violates the FK with no application code involved.
- Slugs/SKUs are per-store unique (`UNIQUE(store_id, slug)`,
  `UNIQUE(store_id, sku)`); identical values in different stores are legal.
- Category cycles: self-loop rejected by DB CHECK, longer chains rejected
  by the service's ancestor walk INSIDE the transaction while holding a
  tx-scoped advisory lock (two racing re-parents serialize; the loser sees
  the committed cycle). Re-parent rewrites descendant paths with one
  prefix-substring UPDATE in the same transaction.
- `min_price_cents` is a derived sort input (service-owned in T020), not a
  second editable price; publication flags are independent booleans.
- `categories`/`products` deletions are RESTRICT; publications cascade with
  their product.

## Assumptions

- Advisory lock is DB-wide for re-parenting (not per-node): a per-node lock
  cannot order two moves that reference each other. Catalog re-parenting is
  rare; the contention cost is negligible for the demo scale.
- drizzle-orm 0.30 cannot express DESC ordering or partial-index WHERE, so
  `products_store_created_idx` mirrors ASC-only in the schema file and the
  reviewed SQL carries the real DESC/partial definitions (commented in
  schema.ts; regen risk recorded).
- Live DB proofs (FK rejections, cycle-under-lock, migration-from-empty)
  are the integration spec: honest SKIP here, CI-live.

## Risk areas

- The subtree rewrite assumes paths always end with '/' (prefix safety is
  unit-tested for slug-extension siblings).
- `deleteCategory` maps RESTRICT violations to CONFLICT by message sniffing
  — constraint-name based, revisit if PG error text changes.
- `catalog/index.ts` still exports the T001-era port stubs; T020 replaces
  them with real implementations (recorded, not silently deleted here).

## Verification (exact results, agent host 2026-10-15)

- Workspace `build` + `typecheck` + `lint` green; backend unit 41/41 (3 new
  catalog tests); backend integration 14/14 with honest `SKIP:` lines (no
  DATABASE_URL on this host; exit 0).
- No HTTP/openapi changes in this task, so the T018 route-policy gate has
  nothing new to classify (verified by absence of route changes).

## Learner notes

- Naive: check cycle by reading the parent chain BEFORE updating →
  read-then-check race; two concurrent re-parents each pass the check and
  jointly form a cycle. Lock-then-walk inside one transaction closes it.
- Naive: update each descendant's path row-by-row in a loop → N round
  trips and torn trees on failure; one prefix UPDATE is atomic.
- Survives restart: the whole tree is durable Postgres state; no cache.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing
merged to `main`/`dev`.
