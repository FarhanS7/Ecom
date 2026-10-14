# Milestone 1 review context: Identity and stores

Per `tasks/phases/01-identity-stores.md`: review artifact for the milestone.
Independent report (`milestone-1-report.md`) is **pending** — requires a
distinct model in a fresh session; unavailable here, recorded not substituted.

## Task ledger (all on feature branches, all pushed, none merged)

| Task | Branch / commits | Evidence |
| ---- | ---------------- | -------- |
| T009 accounts | `feature/identity/t009-...` (`aa4496a`) | `t009-context.md`; schema tests |
| T010 registration/login | `feature/identity/t010-...` (`0d52e99`) | `t010-context.md`; api login.spec (CI-live) |
| T011 refresh/logout | `feature/identity/t011-...` (`4abc923`) | `t011-context.md`; replay/race cases |
| T012 recovery/verification | `feature/identity/t012-...` (`57dc1a1`) | `t012-context.md`; generic-response proof |
| T013 throttling/protections | `feature/identity/t013-...` (`53926ae`) | `t013-context.md`; limiter unit + fail-closed |
| T014 store memberships | `feature/stores/t014-...` (`4bc4e71`) | `t014-context.md`; cross-store denial |
| T015 applications/invites | `feature/stores/t015-...` (`6491a08`) | `t015-context.md`; one-business rule |
| T016 channels/themes | `feature/stores/t016-...` (`156da5e`) | `t016-context.md`; theme resolution |
| T017 account screens | `feature/identity/t017-...` (`4d6ccc8`) | `t017-context.md`; 6 pages 200, zero redirects |
| T018 authz matrix | `feature/stores/t018-...` (`0033942`) | `t018-context.md`; CI completeness gate |
| T091 address book | `feature/identity/t091-...` (`b3617fb`, `407bced`) | `t091-context.md`; 5-verb prod battery |

Subtask split (scope rule) applied to T010–T017 and T091 (a=schema/service,
b=routes/UI/HTTP evidence); parent IDs retained in the tracker.

## Exit gate assessment (phase doc)

Required: one global customer identity, scoped staff membership, seller
approval, two themed storefronts, demonstrated with deterministic data,
permission boundaries, and a recorded failure/recovery case.

- Global customer identity: YES — registration/login/refresh/logout
  (T009–T011) with rotation, family revocation on reuse, generic 401s;
  recovery/verification (T012); browser flows proven over prod loopback.
- Scoped staff membership: YES — store-scoped grants (T014) collapse all
  scope failures to byte-identical generic 404s; matrix harness (T018) fails
  CI on any unclassified OpenAPI path.
- Seller approval: YES — application + invitation + approve/suspend flow
  (T015) with documented one-business-per-account demo rule.
- Two themed storefronts: YES — channel/theme resolution (T016) serves two
  store slugs with distinct themes.
- Permission boundaries demonstration: YES at the code/matrix level
  (route-policy registry + T018 gate); live multi-actor run is the CI
  `permission-matrix.spec` (7 assertions, DB-dependent, runs in CI).
- Deterministic data: NOT CLAIMED — Tier-S seed is T028 (Milestone 2) by
  plan; milestone-1 runs used ad-hoc loopback probes only.
- Failure/recovery case (recorded): refresh-token reuse → entire family
  revoked (T011, documented in t011-context); limiter fail-closed 503 on
  Redis outage (T013, live-logged stall + fix evidence).

## Honest pendings (block merge/release, not Milestone 2 work)

1. Independent review (all tasks + this milestone) — distinct model
   unavailable; every per-task context records "Pending".
2. DB-dependent api integration specs (44 assertions across 11 files)
   — skip with `SKIP:` lines on this host (no Postgres/Redis); the CI
   integration job runs them live; none are claimed passed locally.
3. Playwright e2e (`account.spec.ts`, `addresses.spec.ts`, shell/theme)
   — written, not run (no browsers on agent host).
4. First GitHub Actions run — no runner access here.
5. Live Docker proofs owned by bench host (migration runs, sentinel
   survival) remain open from Milestone 0.

## Cross-cutting decisions carried into Milestone 2

- Drizzle schema files stay dependency-free; cross-module FKs live in
  reviewed sequential SQL (`db/migrations/NNNN-*.sql`). Next free number
  after this milestone: `0006`.
- Gateway: exact allowlist + depth-capped `ALLOWED_GATEWAY_PREFIXES`;
  new browser-reachable per-ID routes must extend both the prefix list
  and the T018 route-policy registry (the T018 gate covers the registry,
  not the gateway list — a known gap, noted in t091-context).
- Store-scope failures collapse to generic 404; platform-admin 403;
  unauthenticated 401; bad self-scoped bodies 422.
- T019's task file names `0004-catalog.sql` in "Expected files"; 0004/0005
  are taken (themes, addresses), so the real migration is `0006-catalog.sql`.
  Recorded here as doc-reality drift, not silently "fixed".
