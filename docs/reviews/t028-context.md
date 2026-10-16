# Review context — T028: Seed a deterministic catalog skeleton

Subtasks: [T028a](../../tasks/items/T028a.md) (deterministic core + identity),
[T028b](../../tasks/items/T028b.md) (catalog/theme generators + verification),
[T028c](../../tasks/items/T028c.md) (live seed verification and storefront
browsing).

Branch: `feature/catalog/t028-seed-a-deterministic-catalog-skeleton`

## Changed files

T028a (`40d6597`)

- `packages/backend/src/db/seed/random.ts` + `.test.ts` — `seedRandom` (documented
  mulberry32), `uuidV5`/`idFor` (name-addressed ids), `priceCents`, `isoAt`,
  `canonicalJson`
- `packages/backend/src/db/seed/identity.ts` + `.test.ts` — `SeedShape`,
  `TIER_S_SHAPE`, `planIdentity`, `writeIdentity`, `insertChunked`, seed markers
- `packages/backend/src/db/seed.ts` + `seed.test.ts` — CLI: `--size s --seed 42`,
  `--size=s`, `SIZE=`/`SEED=`, env fallback, Tier refusal, production guard,
  redacted DB label
- `package.json` — root `seed` script

T028b (`a281e76`)

- `packages/backend/src/db/seed/catalog.ts` + `.test.ts` — categories, products,
  variants, publications; derived `min_price_cents`; the seeded-state matrix
- `packages/backend/src/db/seed/themes.ts` + `.test.ts` — `store_themes` +
  `store_content`, tokens validated against `themeTokensSchema`
- `packages/backend/src/db/seed/verify.ts` + `.test.ts` — plan checksums (pure),
  database checksums, counts, 15 FK checks, distribution facts, seed cleanup
- `packages/backend/src/db/seed.ts` — writes catalog + themes, `--verify` mode
- `package.json` — root `seed:verify` script

T028c

- `packages/backend/tests/integration/catalog-seed.spec.ts` — new: idempotence,
  reproducibility, sensitivity, integrity, and storefront browsing
- `packages/backend/src/db/seed/catalog.ts` + `.test.ts` — the coverage lane (see
  Behavior)
- `packages/backend/src/platform/database.ts` + `database.test.ts`,
  `packages/backend/tests/integration/*.spec.ts` — `findMigrationsDir` and its call
  sites (see Defect 4)
- `packages/backend/src/db/seed/identity.ts` — jsonb cast (Defect 1)
- `packages/backend/src/catalog/product.service.ts`,
  `packages/backend/src/identity/addresses.ts`,
  `packages/backend/src/platform/audit-port.ts` — jsonb writes (Defect 2) and
  `updateVariant` placeholder numbering (Defect 3)
- `packages/backend/tests/integration/jsonb-round-trip.spec.ts` — new regression
- `packages/backend/tests/integration/{storefront,identity-schema,migrations}.spec.ts`
  — stale live-spec expectations (Defect 5)
- `packages/config/src/env.ts` + `env.test.ts` — explicit `COOKIE_SECURE` parsing
  (Defect 6) and the package's first unit tests
- `apps/api/tests/integration/{catalog-write,login,store-scope}.spec.ts`,
  `apps/api/tests/fixtures/actors.ts` — stale live-spec expectations and
  order-dependent teardown (Defect 7)
- `docs/operations/commands.md` — seed workflow notes
- `tasks/items/T028*.md`, `tasks/todo.md`

## Behavior

- **Ids are name-addressed**, not sequence-addressed: RFC 4122 v5 over a fixed
  namespace and a stable name (`idFor('store', 'seed-alpha')`). Adding a row
  therefore never shifts another row's id, which is what makes the seed idempotent
  (`ON CONFLICT DO NOTHING`) and lets two runs be compared byte for byte.
- **Everything is a function of the seed**, including timestamps (derived from
  `SEED_EPOCH_MS = Date.UTC(2025,0,1)`, never `now()`), so a re-run of the same seed
  reproduces the same rows and the same digest.
- **`min_price_cents` is derived, never drawn**: it is the cheapest ACTIVE variant's
  price. `verify.ts` re-derives it from the database and fails the run on any
  disagreement.
- **Visibility is recorded, not assumed.** The plan names the products visible per
  channel (`active` AND the flag) and, separately, the ADR-0010 cases that must stay
  invisible: a draft carrying a channel flag ("on (not live)") and an archived
  product carrying flags.
- **The seeded stores cover the storefront states on purpose**: `seed-alpha`
  (both channels), `seed-beta` (store channel only), `seed-gamma` (active, no
  products). Within a catalogued store the first four products are FORCED into the
  states a storefront must demonstrate (listed, flagged draft, archived, unlisted);
  products past that lane are drawn by weight. Coverage is a guarantee, not luck.
- **Slugs repeat across stores deliberately** — per-store uniqueness is the
  constraint, and proving it needs a repeat. SKUs are globally distinct so a
  duplicate would be a real conflict.
- **Credentials never enter a digest**: `password_hash` is excluded structurally,
  and a unit test proves that changing a hash does not change the checksum. The
  demo password is a fixed argon2id constant for a documented password.
- **The CLI refuses rather than guesses**: only Tier S is implemented and `m`/`l`/`x`
  are refused by name before connecting (T077 owns the streaming tiers), and
  `NODE_ENV=production` is refused unless `SEED_FORCE=1`.

## Verification

Gates on this host (Windows, no CI runner):

| Gate | Result |
| --- | --- |
| `pnpm test` (workspace unit) | config 4, contracts 5, backend 122, web 173 |
| `pnpm --filter=@shopscale/backend run test` | 22 files / 122 tests |
| `pnpm --filter=@shopscale/backend run typecheck` | exit 0 |
| `pnpm --filter=@shopscale/backend run build` | exit 0 |
| `pnpm --filter=@shopscale/api run typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm --filter=@shopscale/backend run test:integration` (live) | 10 files / 23 tests |
| `pnpm --filter=@shopscale/api run test:integration` (live) | 12 files / 50 tests |
| `pnpm seed --size s --seed 42` (live) | 1000 products, 2512 variants, 15 FK checks, verification passed |

### How the live run was obtained

No database was reachable with this repository's documented credentials, and Docker
Desktop was not running. PostgreSQL 17 is installed on the host, so the live runs
used a **throwaway cluster** on a spare port, never the user's own instance:

```powershell
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$data = "$env:TEMP\ss-pg17"
& "$bin\initdb.exe" -D $data -U shopscale --auth=trust -E UTF8 --locale=C
Start-Process -FilePath "$bin\pg_ctl.exe" -ArgumentList @('-D', $data, '-o', '"-p 55432 -c listen_addresses=127.0.0.1"', '-l', "$data\server.log", 'start') -WindowStyle Hidden
& "$bin\createdb.exe" -h 127.0.0.1 -p 55432 -U shopscale shopscale
```

`pg_ctl start` must be launched detached (`Start-Process`): run in the foreground,
the postmaster inherits the shell's handles and the tool kills it on timeout. The
cluster is stopped and deleted at the end of the session.

The full validated environment is required, not just `DATABASE_URL`: `getEnv()`
validates every secret, so `REDIS_CACHE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` and `MOCK_PAYMENTS_SECRET` must also be present or the specs
print their SKIP line — and that line says "DATABASE_URL not configured" for any
validation failure, which is misleading (recorded as a follow-up).

### What the live run actually showed

`pnpm seed --size s --seed 42` (run 1):

```
Identity written: users=14 businesses=3 stores=3 memberships=12 platformRoles=14
Catalog written: categories=16 products=1000 variants=2512 publications=1000
Themes written: themes=3 content=3
Checksum (plan): 24f06b563f8431880201d6ecdb219ddd
Checksum (database): a3cd6e09b631f91cbb0c8f6f829ce35b
Distributions: stores=3 (empty=1) products=1000 variants=2512 (active=2211)
  store-visible=749 marketplace-visible=80 draft-with-flag=66 archived=35
Checks: 15 foreign-key checks ran.
Verification passed: no orphans, no derived-price mismatch, no unpublishable product.
```

Run 2 (same seed, same database) inserted **zero** rows in every table and produced
the same plan and database checksums. `pnpm seed:verify` reproduced the same
database checksum read-only.

`SEED=43` against that same database is the documented caveat: product ids are
name-addressed and therefore identical, so no product row is replaced, while variant
prices and skus differ, so new variants ARE inserted. The result is a hybrid, and
`seed:verify` says so precisely and exits 1:

```
Verification FAILED:
  - 65 seeded product(s) disagree with min(active variant price)
```

So: change the seed on a clean or isolated database. The verifier is the safety net
that makes a hybrid impossible to miss.

## Defects found by the live run (and fixed)

Running the specs against a real database for the first time surfaced seven
defects. All seven are fixed on this branch, each with the evidence above; the
production ones (1, 2, 3, 6) are flagged here for the reviewer because they touch
shipped code outside T028.

1. **Seed wrote jsonb as JSON strings** (`fix(seed)`, `58388ba`). Batched inserts
   passed `canonicalJson(...)` with a bare `::jsonb`. Postgres infers such a
   parameter as jsonb and the driver JSON-encodes it again, so
   `store_content.featured_ids` was stored as the jsonb STRING `"[]"`.
   `verify.ts`'s featured-ids check caught it: "cannot extract elements from a
   scalar". Fixed by casting through text (`$n::text::jsonb`) in `insertChunked`,
   so the database parses the bytes we serialized.

2. **Production write paths did the same thing** (`fix(backend)`, `9caf806`).
   `products.attributes`, `product_variants.attributes`, `addresses.fields` and
   `audit_logs.redacted_before/after` were all written from `JSON.stringify(...)`
   against jsonb columns. The contracts require objects
   (`attributes: z.record(z.unknown())`, address `fields`), no read path parsed the
   string back, and `attributes->>'k'` silently matched nothing. Proven live:
   `createAddress`/`listAddresses` returned `fields` as a `string`, and
   `jsonb_typeof(fields)` was `string`. Fixed the same way, with
   `tests/integration/jsonb-round-trip.spec.ts` as the regression.

3. **`updateVariant` could never succeed** (`fix(backend)`, `9caf806`). It hardcoded
   `p."id" = $3 AND p."version" = $4` while appending the patch values after the two
   scope parameters, so the placeholders shifted by one for every patched field —
   `attributes` was compared as a uuid (`column "attributes" is of type jsonb but
   expression is of type uuid`), and a price or status patch would mis-compare
   similarly. The seller "edit variant" path (T026/T027) was dead. Fixed by putting
   scope and version at `$1-$4`, exactly as `updateProduct` already did. This is the
   finding most worth a second pair of eyes: unit tests mock the SQL, so only a live
   call could see it.

4. **The live specs could never run** (`fix(backend)`, `4837096`). Seven backend
   specs computed the repo root as `join(here, '..', '..', '..')` — from
   `packages/backend/tests/integration` that is `<repo>/packages`, so
   `runMigrations` was handed `<repo>/packages/db/migrations` and died on `readdir`
   (ENOENT) before opening a connection. Reproduced directly with a stub
   connection, then replaced with `findMigrationsDir(here)`, which walks up from the
   caller's own directory. The `apps/api` specs already used the correct depth (and
   one reads `docs/openapi.json` from that root), so they were left alone.

5. **Three stale expectations in the now-runnable specs** (`fix(backend)`,
   `e0e722b`). The T016 theme fixture wrote its tokens with `JSON.stringify` against
   jsonb, so the theme failed the closed-token contract and `resolveStorefront` fell
   back to `DEFAULT_THEME`. `identity-schema` asserted 7 permissions (T010 added five
   store-role permissions in 0002; the total is 12, while admin's PLATFORM grants are
   still the seven T009 permissions). `migrations` dropped the tracking table and
   expected at most one file to apply, which cannot hold — with no ledger every file
   re-applies. Each was replaced with an assertion that states the real invariant
   (exact permission sets, idempotent re-apply then a fully-skipped run) rather than
   a number that goes stale.

6. **`COOKIE_SECURE=false` was impossible** (`fix(config)`, `9296634`). The schema
   used `z.coerce.boolean()`, which applies `Boolean(value)` — so the string
   `"false"` parsed as `true`, and the flag could only ever be off by omitting the
   variable. The T010b login spec sets `COOKIE_SECURE=false` and still received a
   `Secure` cookie, which is how the live run found it; in a local HTTP environment
   the same bug means the browser never sends the cookie back. Now the conventional
   spellings are parsed explicitly (and a typo is a boot error), with the config
   package's first tests.

7. **Four API-spec assertions that had never executed** (`fix(api)`, `a8e277b`).
   `login` and `store-scope` compared whole problem documents for equality, but
   every response carries a unique `requestId` (and `instance` echoes the URL), so
   the "indistinguishable failure" assertions could never hold; they now compare
   everything except those correlation fields. `catalog-write` archived with the
   version from `createProduct` although creating a variant bumps the product's
   optimistic version (so the 409 was correct), and asserted a malformed-status
   response does not match `/status|constraint/i` even though every problem document
   contains a `status` field. `teardownMatrixWorld` deleted stores while products
   still referenced them (`RESTRICT`), making a later spec's teardown fail depending
   on file order; it now removes publications, variants and products first. The API
   integration suite went from 39/50 to **50/50 live**.

## Pendings (not claimed as done)

- **API-level live suite**: runs fully on this host (12 files / 50 tests) — the
  sessions are Postgres-backed and the setup stubs the rate limiter, so Redis is not
  needed. It is green, so this is no longer a pending. Redis-dependent *unit* paths
  outside these specs were not exercised.
- **Playwright**: no browsers on this host, so `product-list`, `product-detail`,
  `storefront-home` and `seller-catalog` are unrun.
- **Visual baseline diffing** and the **independent review** (needs a distinct model
  in a fresh session).
- **CI**: there is no runner here; these are local runs.
- **Tiers M/L/XL** and the **ledger half of `seed:verify`** (no orders until T077).
- **Follow-ups recorded, not done**: the SKIP message in the specs reports
  "DATABASE_URL not configured" for any `getEnv()` validation failure; the CLI has no
  `--reset`, so switching seeds on a dirty database is documented rather than
  prevented.
