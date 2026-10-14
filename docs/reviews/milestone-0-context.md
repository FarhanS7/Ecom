# Milestone 0 review context: Foundation

Per `tasks/phases/00-foundation.md`: review artifact for the milestone.
Independent report (`milestone-0-report.md`) is **pending** — requires a
distinct model in a fresh session; unavailable here, recorded not substituted.

## Task ledger (all on `feature/platform/*`, all pushed, none merged)

| Task | Branch / commits | Evidence |
| ---- | ---------------- | -------- |
| T001 review | `.../t001-...` (`bc45c04`) | `docs/planning/decision-review.md`, `docs/reviews/t001-context.md` |
| T002 workspace | `.../t002-...` (`56c03b1` +2 cleanups) | build+typecheck green; `docs/reviews/t002-context.md` |
| T003 migrations | `.../t003-...` (`012fa97`) | harness tests 3 passed (2 skip w/o infra); `t003-context.md` |
| T004 docker | `.../t004-...` (`4fb97cc`, `5dc39bb` docs) | compose config proofs; `local-measurements.md`; `t004-context.md` |
| T005 config+health | `.../t005-...` (`fe15e6a`, `c06835b`) | api 3/3 over HTTP; `t005-context.md` |
| T006 conventions | `.../t006-...` (`505cff0`, `cc6a43d`) | backend 9/9, api 10/10; `t006-context.md` |
| T007 shell | `.../t007-...` (`d108f25`, `82666ee`) | prod curl battery + bundle grep; `t007-context.md` |
| T008 CI | `.../t008-...` (this commit) | `docs/operations/ci-evidence.md` |

## Exit gate assessment (phase doc)

Required: reproducible workspace, small Docker environment, real database
tests, web/API skeleton.

- Reproducible workspace: YES — clean-clone `pnpm install --frozen-lockfile`
  + `pnpm check` path proven across T002–T008.
- Small Docker environment: DEFINED and config-proven (`core`/`jobs`
  profiles, memory budgets); live `up` pending a Docker host.
- Real database tests: harness + specs exist; redacted-error paths executed;
  live-DB assertions pending infra (CI `integration` job runs them first).
- Web/API skeleton: YES — prod servers served real traffic in T007 evidence.

Demonstration clause ("deterministic data, permission boundaries, recorded
failure/recovery"): Tier S seed is T028, permission matrix is T014/T018,
recovery drills are T073 — all Milestone 1+ by plan. Milestone 0 does not
claim them.

## Honest pendings (block merge/release, not Milestone 1 work)

1. Independent review (all tasks) — distinct model unavailable.
2. Live Docker proofs (T003 migration run, T004 sentinel survival + stats,
   T007 Playwright run) — no Docker/browsers on the agent host; CI + bench
   host own them.
3. GitHub Actions first run — no runner access here; linked in ci-evidence
   when available.
4. OpenAPI `3.0.0` vs contract aspiration `3.1` — recorded, pending generator
   upgrade decision.
