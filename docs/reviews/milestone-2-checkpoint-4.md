# Milestone 2 checkpoint 4 (after T028)

Per `tasks/phases/02-catalog-storefront.md`: "Pause for integrated verification
after every three tasks." T028 (the deterministic seed skeleton) is complete, and
the checkpoint item in `tasks/todo.md` follows it because the seed is what makes the
catalog real for everything downstream. This is a quality/learning checkpoint, not a
release gate. Nothing is merged to `main`/`dev`; every task stays on its own pushed
feature branch.

Branch tips: T025 `2562668`, T026 `6fe184f`, T027 `9859726`, T028 `a8e277b`
(T028a `40d6597`, T028b `a281e76`, T028c `2bdc054`, plus the fixes below).

## Integrated verification performed on this host (2026-10-16)

This is the first checkpoint where the **live** suites actually ran. Earlier
checkpoints reported honest `SKIP:` lines because no database was reachable; a
migrations-path defect (Defect 4 in `t028-context.md`) meant the backend specs could
not even find the migration files. That is fixed, and a throwaway PostgreSQL 17
cluster (port 55432, never the user's own instance) let the whole live suite run.

| Check | Result |
| ----- | ------ |
| Workspace `build` | exit 0 |
| Workspace `typecheck` | exit 0 |
| Workspace `lint` | exit 0 |
| Config unit | 4/4 |
| Contracts unit | 5/5 |
| Backend unit | 22 files / 122 tests |
| Web unit (jsdom, Testing Library) | 19 files / 173 tests |
| Backend integration | 10 files / 23 tests, **all live, no `SKIP:` lines** |
| API integration | 12 files / 50 tests, **all live, no `SKIP:` lines** |
| `pnpm seed --size s --seed 42` | 1000 products / 2512 variants / 1000 publications; 15 FK checks; verification passed |
| `pnpm seed` a second time (same DB, same seed) | 0 rows inserted in every table; identical plan and database checksums |
| `pnpm seed:verify` (read-only) | same database checksum; distributions + 15 FK checks reported |
| `docs/openapi.json` drift after `pnpm openapi` | clean; 32 paths, unchanged |

## Changed flow

The seed is the spine of Milestone 2's verification. Every row is a pure function of
`(size, seed)`: ids are name-addressed (RFC 4122 v5 over a fixed namespace) so
inserting a row never shifts another row's id, timestamps derive from a fixed epoch
rather than `now()`, and `min_price_cents` is re-derived from the cheapest ACTIVE
variant and re-checked against the database. Two runs of the same seed are byte
identical; the storefront states a test needs (both channels, store-only, empty,
draft-with-a-flag, archived, unlisted) are guaranteed by construction rather than by
a weighted draw, so the assertions cannot go vacuous.

With a live database in reach, the previously-skipped integration suites ran for
real and the catalog write path was exercised end to end over HTTP (T020/T027
lifecycle) and at the database boundary (jsonb round-trips, variant edits). The
seeded catalog was browsed through the real read service per channel.

## Recorded failure/recovery case

T028's case is the **jsonb double-encoding**: the seed wrote `canonicalJson(...)`
through a bare `::jsonb` cast, and because Postgres infers such a parameter as jsonb
the driver encoded it a second time, storing `featured_ids` as a JSON *string*. The
seed's own `verify.ts` caught it on the first live run ("cannot extract elements from
a scalar"). Chasing it showed the same defect in shipped code — `products.attributes`,
`product_variants.attributes`, `addresses.fields` and the audit trail — where the
contracts require objects and no read path parsed the string back. Recovery: bind
JSON through `::text::jsonb` (seed, product, variant, address, audit), pin it with
`tests/integration/jsonb-round-trip.spec.ts` (including an `->>` filter that only
matches a real object), and fix `updateVariant`, whose hardcoded `$3`/`$4`
placeholders made every variant edit fail. All seven defects the live run found are
enumerated with evidence in `docs/reviews/t028-context.md`.

## Honest pendings (block merge/release, not the next task)

1. Independent review (every task + all checkpoints) — distinct model in a fresh
   session unavailable here; every context doc records "Pending".
2. Playwright / browser runs — no browsers on the agent host, so `product-list`,
   `product-detail`, `storefront-home` and `seller-catalog` remain unrun.
3. Visual baseline diffing for the design system and the console screens.
4. First GitHub Actions run — no runner access here; these are local runs.
5. Tiers M/L/XL and the ledger half of `seed:verify` (no orders until T077).
6. Follow-ups recorded, not done: the specs' `SKIP:` line says "DATABASE_URL not
   configured" for any `getEnv()` validation failure; the seed CLI has no `--reset`,
   so switching seeds on a dirty database is documented (and detected by
   `seed:verify`) rather than prevented.

## Reviewer focus for this checkpoint

- **The four production fixes are outside T028's stated scope.** They are proven
  (jsonb double-encoding, `updateVariant` placeholder numbering, `COOKIE_SECURE`
  coercion) and each has its own commit and regression coverage, but the reviewer
  may prefer them relocated to their own task/branch. See Defects 2, 3 and 6 in
  `docs/reviews/t028-context.md`.
- **`updateVariant` is the highest-value fix to double-check.** Unit tests mock the
  SQL, so only a live call could see that the WHERE clause compared an `attributes`
  value against a uuid. Confirm the scope/version parameters now occupy `$1-$4` for
  every patch shape.
- **Determinism claims are structural, not incidental.** Confirm nothing in the seed
  reads the clock or an unordered source: ids are name-addressed, timestamps derive
  from `SEED_EPOCH_MS`, and iteration order is fixed by the plan.
- **Coverage is guaranteed, not sampled.** Confirm the first four products of each
  catalogued store are forced into the storefront states the specs assert, so a
  different seed cannot silently drop the case under test.
- **The live suites now run in CI.** Confirm the migrations-path fix and the spec
  fixes are the kind of change CI can rely on, and that no assertion was weakened to
  reach green (the spec changes state the intended invariant more precisely).
