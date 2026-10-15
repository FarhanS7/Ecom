# Review context — T021: Implement channel-aware catalog reads

Branch: `feature/catalog/t021-implement-channel-aware-catalog-reads`
(parent task; linked subtasks T021a/T021b per the scope rule).

## Changed files

T021a (`c0bb154`): `packages/backend/src/catalog/read.service.ts`
(+ `read.service.test.ts`), `contracts/src/catalog.ts` (channel DTOs),
`catalog/index.ts` (export), T021a/T021b subtask docs.

T021b (this commit): `apps/api/src/catalog.controller.ts` (4 public
routes), `app.module.ts` registration, `route-policy.ts` (+4 public
entries), `scripts/openapi.mjs` expected-path list (+4),
`docs/openapi.json` regenerated (32 paths, drift-free),
`packages/backend/tests/integration/catalog-visibility.spec.ts`.

## Behavior

- Every public read RECHECKS the whole visibility chain in SQL: business
  active → store active → product `status='active'` → the channel's
  publication flag. List and detail share ONE `WHERE` shape, so a detail
  404 can never be distinguished from an unknown slug by an outsider.
- Marketplace sees `marketplace_enabled` products from active stores;
  the store channel additionally pins `store_id` to the resolved slug and
  requires `store_enabled`. Store-only products never appear on the
  marketplace and vice versa (module acceptance scenario).
- Draft, archived, fully-unpublished products and suspended-store
  products are invisible on BOTH channels.
- Sorts are a closed, id-tiebroken set (newest/price_asc/price_desc/
  popularity) so T022 cursors layer on a total order; `limit` capped at
  100; `nextCursor` is always null now but the DTO shape is final.
- Detail exposes only ACTIVE variants; `store` (`{slug,name}`) is included
  for storefront rendering (T024+).

## Contract decisions (recorded)

- Channel DTOs are channel-specific names (`channelListResponse`,
  `channelProductDetail`) rather than the T002 drafts in
  `contracts/src/api/index.ts`, because the drafts carry `primaryImageUrl`,
  `images`, and `onHand` — fields whose tables (media T035, inventory
  T032) do not exist yet. Shipping URL fields that can never be populated
  would lie to clients; the drafts stay untouched until T025 retires them.
- Malformed public INPUT → 422 (`UnprocessableEntityException`), not 404:
  storefront existence is public information, so there is no oracle to
  protect (addresses precedent). The scoped-route 404 rule exists only
  where scope could leak store existence; public routes have no scope.
  Malformed/unknown store SLUG → 404 (matches T016 channel controller).

## Assumptions

- The backend integration suite is the right home for the visibility
  battery (T019 precedent): channel visibility is a SQL property driven
  through the read service; HTTP plumbing is already proven by
  catalog-write.spec.ts and the T018 matrix. The T021b subtask doc (first
  drafted with an `apps/api/` path) was corrected before commit.
- `resolveActiveStoreSlug` mirrors `resolveStorefront`'s active-store rule
  rather than importing it: the read service must not depend on the
  stores module's theme resolution.

## Risk areas

- The visibility `WHERE` uses positional params with sentinel values
  (`''`, `-1`); a future filter must keep the sentinels distinct from real
  values (slugs are non-empty, prices are nonnegative → safe today).
- `limit` is interpolated as a number literal (validated integer ≤100),
  never a string — no injection surface, but worth noting for review.

## Verification (exact results, agent host 2026-10-15/16)

- Workspace `build` + `typecheck` + `lint` green; backend unit 44/44 (3
  new read-service tests); contracts 4/4.
- `docs/openapi.json` regenerated from built dist (32 paths, drift-free).
- Backend integration 7 files / 16 tests, api integration 12 files /
  49 tests — both exit 0 with honest `SKIP:` lines (no reachable DB or
  Redis/Postgres here). The T018 CI gate test passes: all 32 OpenAPI
  paths classified, zero drift.
- Live-DB battery (two stores, three publication combinations, cross-
  channel leakage, draft/archived/unpublished invisibility, suspended-
  store disappearance, active-variant-only detail, filter/sort
  determinism, limit cap) — written, compiled, honestly not run locally;
  CI-live.

## Learner notes

- Naive: filter by `product.status` and forget the store/business status
  → a suspended merchant's products stay purchasable; the chain must be
  complete on EVERY read, never cached from write time.
- Naive: separate list and detail queries with different WHERE clauses →
  drift; a product visible in list but 404 on detail (or vice versa). One
  shared fragment prevents it.
- Naive: `ORDER BY price` alone → non-total order, pagination duplicates
  and gaps once T022 cursors arrive; the id tiebreak is not decoration.
- Survives restart: everything is Postgres state; there is no projection
  cache to invalidate, so a restart changes nothing observable.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here.
Nothing merged to `main`/`dev`.
