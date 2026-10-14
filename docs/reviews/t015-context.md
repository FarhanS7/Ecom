# Review context — T015: Seller applications and invitations

Branch: `feature/stores/t015-seller-applications-and-invitations`
(parent task; linked subtasks T015a/T015b per the scope rule).

## Changed files

T015a (`6a2e6e1`): `db/migrations/0003-audit.sql` (append-only audit_logs +
one-use invitations with pending-dedupe partial unique), `platform/audit-port.ts`,
`stores/onboarding.service.ts` (apply/approve/suspend/invite/accept/update +
last-owner guard + platform-admin gate), drizzle mirrors (+platform schema,
16-table generate-diff), backend `onboarding.spec.ts`.
T015b (this commit): contracts seller/admin/invitation/member DTOs (+slug
pattern), api `onboarding.controller.ts` + `stores.controller.ts` extensions,
`app.module.ts`, api `onboarding.spec.ts` (4 tests), `scripts/openapi.mjs`
(path list), `docs/openapi.json` (+6 paths), `tasks/todo.md`.

## Behavior

- Applications: one business per account (demo rule, 409), slug guarded;
  approval pending→active and suspension active→suspended are admin-only with
  legal-transition 409s; every step audited in-transaction.
- Invitations: team:manage-scoped creation, demo handoff token in 201 (no
  email provider yet), email-match + active-account acceptance, one-use with
  generic 404 replays, revoked→reactivate / active→409.
- Member updates: cross-store attempts 404 (scope-first), last-owner demotion
  or revocation 409. Malformed bodies share the scoped 404 (documented
  deviation from 422: no existence oracle either way).

## Assumptions

- Verification gating of registrations stays deferred (T010 decision).
- Onboarding mutations skip rate gates (authenticated-only surface; T013
  mechanism proven on auth routes; residual noted, not silent).
- Suspended stores keep membership reads (suspension gates publishing/checkout).

## Risk areas

- Invite tokens in 201 responses are demo handoff, not a pattern for prod
  (prod emails links; the token never hits logs either way).
- Admin check is platform-role based; matrix hardening is T018.

## Verification (exact results, agent host 2026-10-15)

- Backend unit 32/32; integration honest skips (live in CI).
- API 34/34 green (onboarding 4 skip w/o DB); all 6 routes confirmed in log.
- Workspace `build` + `typecheck` + `lint` green. `pnpm openapi` clean (19 paths).

## Learner notes

- Naive: invitation accept without row lock → double membership; `FOR UPDATE
  OF i` + accepted_at check inside one txn; caught by repeat-accept test.
- Naive: owner check as `role == 'owner'` on the ACTOR only → demoting
  yourself bricks the store; count-other-owners guard; caught by 409 tests.
- Naive: distinct 404/403 for cross-store → scope oracle; single generic 404.
- Survives restart: applications/stores/invitations/memberships/audits (DB).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
