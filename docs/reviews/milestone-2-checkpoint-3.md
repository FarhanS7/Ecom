# Milestone 2 checkpoint 3 (after T025–T027)

Per `tasks/phases/02-catalog-storefront.md`: "Pause for integrated verification
after every three tasks." T025, T026 and T027 are complete. This is a
quality/learning checkpoint, not a release gate. Nothing is merged to
`main`/`dev`; every task stays on its own pushed feature branch.

Branch tips: T025 `2562668`, T026 `6fe184f`, T027 `9859726` (T027a `bd73c35`,
T027b `1516ec7`).

## Integrated verification performed on this host (2026-10-16)

| Check | Result |
| ----- | ------ |
| Workspace `build` | exit 0 |
| Workspace `typecheck` | exit 0 |
| Workspace `lint` | exit 0 |
| Contracts unit | 5/5 |
| Backend unit | 15 files / 51 tests |
| Web unit (jsdom, Testing Library) | 19 files / 173 tests |
| Backend integration | 8 files / 19 tests, exit 0 (17 honest `SKIP:` lines — no live DB) |
| API integration | 12 files / 50 tests, exit 0 (10 honest `SKIP:` lines — no live DB) |
| `docs/openapi.json` drift after `pnpm openapi` | clean; 32 paths, unchanged |
| Production web server, API unreachable | marketplace `/products` 200 with the honest unavailable state; both seller console routes 200 with the console unavailable card and no "not found" wording |
| Production web server, stub API answering only 401 | `/seller/{storeId}/products` and its editor route 200 with the sign-in prompt and no console markup |

## Changed flow, as far as the environment allows

The catalog is now readable and writable end to end through the product
surface. Publicly (T025/T026): the listing island drives filters/sort/cursor from
the URL and the PDP renders server-side per channel with variant selection in
`?variant=`. For the seller (T027): the console authenticates the caller
server-side, keeps one product version across the editor, variant table and
publication controls, and can now actually publish — the missing draft→active
transition that made every seller-authored product permanently invisible was
closed in ADR-0010, so T027's own acceptance scenario is reachable rather than
vacuous.

The browser leg is still verified only for degrade and boundary paths (outage,
401, malformed 404s, the design-system screenshots). The populated journeys —
a shopper filtering a seeded catalog, a seller creating and publishing a product
in a real browser — need the full local stack or CI.

## Recorded failure/recovery case

T027's case is the **stale-version race**: two editors open the same product; the
first saves (version 2 → 3) and the second's save is refused with 409. The
console re-reads the product and offers only two honest options — "Reload latest"
(adopt the other writer's values) or "Apply my changes" (re-send on top of the
fresh version). The same mechanism covers publication: a publish with no active
variant is refused with a constant 409 and the version bump is rolled back with
it, so a refused publish is neither a phantom write nor an oracle.

Both halves of the recovery were pinned by tests written before the fix:
`product-workspace.test.tsx` proves the fresh version flows between panels, and
`publication-controls.test.tsx` proves the retry re-sends on the version the
conflict reported. Two real defects were found this way and fixed in the T027c
commit (a retry that captured the stale version; a form holding its own copy of
the version). The browser reproduction (two tabs) is written in
`tests/e2e/seller-catalog.spec.ts` and pending a bench host; the API-level case
runs in CI with a live DB. Earlier recorded cases still hold: T020's
version-conflict 409 with a successful retry, the T018 permission matrix's
uniform generic 404, and T024's catalog-outage degrade.

## Honest pendings (block merge/release, not the next task)

1. Independent review (every task + all checkpoints) — distinct model in a fresh
   session unavailable here; every context doc records "Pending".
2. Live-DB integration runs — skip honestly on this host (no Postgres/Redis);
   CI runs them, and none are claimed passed locally.
3. Browser/Playwright runs — no browsers on the agent host. This now includes
   `seller-catalog.spec.ts`, which additionally needs a provisioned store member
   (`SELLER_E2E_EMAIL/PASSWORD/STORE_ID/STORE_SLUG`).
4. Visual baseline diffing for the design system and the console screens.
5. First GitHub Actions run — no runner access here.

## Reviewer focus for this checkpoint

- **The publish path is one transaction.** Confirm `assertHasActiveVariant` runs
  after the versioned UPDATE and inside the same transaction, so a refused
  publish cannot bump the version or reveal whether the product exists
  (`packages/backend/src/catalog/product.service.ts`, ADR-0010).
- **The seller write surface is still unreachable from the browser.** No seller
  route was added to the gateway allowlist; every seller write originates in a
  Next server action. Confirm the allowlist diff is empty for T027.
- **One source of truth for the version.** Confirm no seller component keeps its
  own copy of `product.version` or of a bound retry request.
- **Honest states stay honest.** An outage must never render as "no products" or
  "not found"; the console's gate cards must carry no store or product data; a
  channel enabled on a draft must say "on (not live)" rather than imply a live
  listing.
