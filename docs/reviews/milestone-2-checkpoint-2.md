# Milestone 2 checkpoint 2 (after T022–T024)

Per `tasks/phases/02-catalog-storefront.md`: "Pause for integrated verification
after every three tasks." T022, T023 and T024 are complete. This is a
quality/learning checkpoint, not a release gate. Nothing is merged to
`main`/`dev`; every task stays on its own pushed feature branch.

## Integrated verification performed on this host (2026-10-16)

| Check | Result |
| ----- | ------ |
| Workspace `build` + `typecheck` + `lint` | green |
| Backend unit | 51/51 |
| Web unit (jsdom, Testing Library) | 35/35 |
| Contracts unit | 4/4 |
| Backend integration | 8 files / 19 tests, exit 0 (honest `SKIP:` — no DB) |
| API integration | 12 files / 49 tests, exit 0 (honest `SKIP:` — no DB) |
| `docs/openapi.json` drift + T018 gate | clean, 32 paths classified |
| Production web server, no API reachable | `/` 200 with honest unavailable state; `/stores/{slug}` 404 |

## Changed flow, as far as the environment allows

Pagination is stable and filter-bound (T022); the design system is
token-driven with validated tenant themes (T023); the marketplace and store
homes render REAL, channel-scoped products with working links and honest
empty/unavailable states (T024). The browser leg is verified only for the
degrade path and the 404 boundaries — the populated storefront still needs the
full local stack (or CI), which this host cannot provide.

## Recorded failure/recovery case

T024's recorded case is the catalog outage: with no API reachable the home
still returns 200, renders the hero, and says the catalog is temporarily
unavailable (0 product tiles) instead of crashing or showing fabricated
products; unknown/malformed store slugs return 404 without a fetch. Reproduced
live with `next start` (exact numbers in `t024-context.md`). Earlier recorded
cases still hold: T020's version-conflict 409 with a successful retry, and the
T018 permission matrix's uniform generic 404.

## Honest pendings (block merge/release, not the next task)

1. Independent review (every task + both checkpoints) — distinct model in a
   fresh session unavailable here; all contexts record "Pending".
2. Live-DB integration runs — skip honestly on this host (no Postgres/Redis);
   CI runs them, and none are claimed passed locally.
3. Browser/Playwright runs, including T023's screenshots and T024's populated
   storefront journey — no browsers on the agent host.
4. Visual baseline diffing for the design system — needs a recorded bench host
   with pinned fonts/images.
5. First GitHub Actions run — no runner access here.

## Reviewer focus for this checkpoint

- The tenant bridge is scoped to `[data-tenant]`; confirm no component reads a
  raw `--store-*` variable directly (the token layer is the only consumer).
- The home loaders validate with the shared contract and separate empty from
  unavailable; confirm an outage can never render as "no products".
- Keyset totality and cursor binding (T022) still hold after T024 consumed the
  reads — no pagination parameters were bypassed by the web layer.
