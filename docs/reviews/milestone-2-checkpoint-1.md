# Milestone 2 checkpoint 1 (after T019–T021)

Per `tasks/phases/02-catalog-storefront.md`: "Pause for integrated
verification after every three tasks." T019, T020, T021 are complete; T022
immediately follows and is included here for continuity of the review
trail. This is a quality/learning checkpoint, not a release gate. Nothing
is merged to `main`/`dev`.

## Integrated verification performed on this host (2026-10-15/16)

| Check | Result |
| ----- | ------ |
| Workspace `build` + `typecheck` + `lint` | green |
| Backend unit | 51/51 (catalog schema, category, product, read-service, cursor/keyset) |
| Contracts unit | 4/4 |
| Backend integration | 8 files / 19 tests, exit 0 (honest `SKIP:` lines — no DB) |
| API integration | 12 files / 49 tests, exit 0 (honest `SKIP:` lines) |
| `docs/openapi.json` drift | clean (32 paths), T018 completeness gate green |
| Route-policy registry | every documented path classified; zero undocumented |

## Changed flow, as far as the environment allows

Products can be authored and versioned (T020 service + routes), published
per channel (independent flags), and browsed on marketplace/store channels
with filters, sorts, and keyset pagination (T021/T022). The end-to-end
storefront UI is T023–T027 and not yet built, so the browser leg of this
checkpoint is deferred with the rest of Milestone 2's UI work.

## Recorded failure/recovery case

T020's optimistic-concurrency scenario is the recorded failure case: two
writers submit the same product version; exactly one 200, the loser 409,
and a retry against the fresh version succeeds. It is asserted in
`catalog-write.spec.ts` (CI-live). The permission-boundary failure case
(non-member / member-without-grant → uniform generic 404, anonymous → 401)
is asserted there and cross-checked against the T018 matrix.

## Honest pendings (block merge/release, not the next task)

1. Independent review (each task + this checkpoint) — distinct model in a
   fresh session unavailable here; every context records "Pending".
2. Live-DB integration runs — skip honestly on this host (no Postgres);
   CI runs them. None are claimed passed locally.
3. Browser/Playwright runs — no browsers on the agent host.
4. First GitHub Actions run — no runner access here.

## Reviewer focus for this checkpoint

- Uniform no-oracle rule: scoped store routes 404 on every scope failure
  (incl. member-without-grant); 403 only for platform-admin. Confirm the
  catalog controller matches (it was corrected from a first-draft 403).
- Visibility chain completeness and single-source WHERE (list-query.ts).
- Keyset totality: `id` tiebreak on every sort; cursor bound to
  channel+filters.
