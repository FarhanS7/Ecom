# Review context — T022: Add stable keyset pagination

Branch: `feature/catalog/t022-add-stable-keyset-pagination` (parent task;
linked subtasks T022a/T022b per the scope rule).

## Changed files

T022a (`e6eb63e`): `catalog/cursor.ts` (+ `cursor.test.ts`),
`catalog/list-query.ts`, `catalog/read.service.ts` (list now returns a
cursor; the visibility WHERE moved to list-query.ts as the single shared
shape), `catalog/index.ts` exports, T022a/T022b subtask docs.

T022b (this commit): `contracts/src/catalog.ts` (`channelListQuery` gains
a bounded `cursor`), `catalog.controller.ts` (passes the cursor; maps
`CursorError`→422), `docs/openapi.json` regenerated (same 32 paths; the
list query param set changed), `packages/backend/tests/integration/
pagination.spec.ts`.

## Behavior

- Cursors are opaque base64url JSON carrying version, sort, a channel+
  filter fingerprint, and the last row's `(sortValue, id)` tuple. Decode
  rejects malformed/oversized input, unknown versions, unknown sorts, and
  malformed fingerprints.
- The list query is KEYSET: a per-sort Postgres row comparison
  (`(a,b) </> ($n,$n+1)` with typed casts) matching the ORDER fragment
  exactly. The service fetches `limit+1`, returns `limit`, and derives
  `nextCursor` from the last RETURNED row (null on the last page).
- Binding the cursor to the fingerprint makes replay fail: a marketplace
  cursor used on the store channel, or a cursor issued under one price
  band replayed under another, raises `CursorError` → HTTP 422. A
  structurally invalid cursor is a typed error, never a silent first page.
- Limits are clamped to 1..100.

## Mutation semantics (documented per the task)

Keyset is stable for a FIXED dataset: the predicate is a total order on
`(sortValue, id)` with `id` as the tiebreak, so rows with duplicate prices
or duplicate timestamps never duplicate or skip across pages. It is NOT a
cross-request snapshot — writes made between page requests may surface,
vanish, or move between remaining pages. That is the deliberate trade-off
versus offset pagination (which both duplicates and skips under the same
writes) and matches the module's "cursor price ties remain deterministic"
acceptance scenario. The spec asserts the fixed-dataset guarantee and
re-walks to prove stability; the interleaved-write case is documented here
rather than asserted, because it depends on write timing, not on a
property the system can promise.

## Migration drift (recorded, not invented)

T022's expected files name `db/migrations/0005-catalog-indexes.sql`. It was
NOT created: 0005 is taken (addresses), and the three indexes the data-
model plan named already shipped in T019's `0006-catalog.sql`. A
non-schema task must not add a migration; a global-order index, if one is
ever needed for marketplace-wide pagination, is a measured addition in
T078. Full note in `tasks/items/T022a.md`.

## Risk areas

- The keyset params are cast (`::timestamptz`, `::bigint`, `::int`,
  `::uuid`) so Postgres cannot mis-infer from the row comparison; a future
  sort whose value is not one of these types must add its own cast.
- `id` tiebreak is what makes the order total; removing it would reintroduce
  the duplicate/skip class the spec guards against.

## Verification (exact results, agent host 2026-10-15/16)

- Workspace `build` + `typecheck` + `lint` green; backend unit 51/51 (7 new
  cursor/keyset tests); contracts unchanged count.
- `docs/openapi.json` regenerated (32 paths, drift-free); T018 gate green
  in the api integration run.
- Backend integration 8 files / 19 tests, api integration 12 files / 49
  tests — both exit 0 with honest `SKIP:` lines. Live page-walk (all four
  sorts, duplicate prices AND timestamps, no duplicates/gaps, re-walk
  stability, asc/desc mirror, wrong-channel + changed-filter rejection,
  malformed/forged cursor rejection, bounded limits) — written, compiled,
  honestly not run locally; CI-live.

## Learner notes

- Naive: OFFSET pagination → duplicate and skipped rows whenever rows are
  inserted/updated beneath the window, and O(offset) cost. Keyset makes the
  predicate a total order and seeks the index.
- Naive: cursor carrying only the sort value → duplicate prices/timestamps
  provably skip or repeat rows; the `(value, id)` tuple is mandatory.
- Naive: trusting a client-supplied cursor without binding it to the
  query → silently different result sets; the fingerprint closes it.
- What survives restart: nothing is cached — cursors are computed from
  durable rows, so a restart mid-walk simply resumes from the same tuple.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here.
Nothing merged to `main`/`dev`.
