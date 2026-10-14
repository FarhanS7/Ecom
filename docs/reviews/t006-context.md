# Review context — T006: API and error conventions

Branch: `feature/platform/t006-establish-api-and-error-conventions`
(parent task; linked subtasks T006a/T006b per the scope rule).

## Changed files

T006a (`505cff0`): `packages/contracts/src/errors.ts` (canonical codes +
problem schema), `api/index.ts` (problemDetails → alias, single source),
backend `platform/http.ts` + `http.test.ts` (pure helpers, 7 tests).
T006b (this commit): api `problem.filter.ts`, `request-id.hook.ts`,
`ping.controller.ts`, `main.ts` (422 pipe + exceptionFactory, `/v1` prefix
with health/docs/metrics excluded, global filter, request-ID hook),
`app.module.ts`, `tests/integration/http-contract.spec.ts` (7 tests),
`scripts/openapi.mjs` + root `openapi` script, `docs/openapi.json`
(generated), `tasks/todo.md`.

## Behavior

- Every error is `{type,title,status,detail,instance,code,requestId}`;
  5xx fully redacted, validation carries constraint keys only, `instance`
  strips query strings (one-time tokens never echo).
- Request IDs: valid echoed, missing generated (UUID), malformed → 400.
- `/v1/*` versioned; health/docs/metrics unversioned; unknown routes 404
  through Nest's handler into the same filter (custom Fastify 404 removed —
  the adapter allows exactly one and Nest registers its own at init).

## Assumptions

- `GET /v1/ping` is a deliberate minimal validation/versioning vehicle, not a
  business endpoint; owning tasks reuse the conventions unchanged.
- Validation uses an EXPLICIT param pipe: esbuild strips design:paramtypes, so
  inferred DTO types are invisible to the global pipe under vitest (proven by
  failing test, then fixed). Identical behavior in tsc builds.
- Swagger setup stays prod-only: its explorer needs tsc metadata.
- Measured `openapi: 3.0.0` (@nestjs/swagger 7); the 3.1 aspiration in
  api-contracts.md is recorded as pending, never faked.

## Risk areas

- Filter detail passes short 4xx strings through: a future 4xx message
  containing secrets would leak — mitigated by the validation path (keys
  only) and the secret-free test asserting on every error body.
- `docs/openapi.json` drift: the artifact test pins title/version/paths;
  full regeneration check (`pnpm openapi` + `git diff --exit-code`) belongs
  to the T008 CI job.

## Verification (exact results, agent host 2026-10-14)

- Backend 9/9 unit; API 10/10 integration over real Fastify inject
  (200/200/400/404/200/404/422 observed in server logs).
- `pnpm openapi` (dummy env): wrote `docs/openapi.json`, secret scan clean,
  contract validation passed, `openapi: 3.0.0`, paths
  `/health/live, /health/ready, /v1/ping`.
- Workspace `build` + `typecheck` green. `pnpm lint` unrunnable until T008.

## Learner notes

- Naive: echo exception messages/stacks to clients → caught by secret-free +
  no-stack assertions on every error test.
- Naive: trust `X-Request-Id` verbatim → log injection; caught by allowlist
  rejection test. Naive: `instance: req.url` raw → token leak; caught by
  query-with-token test.
- Survives restart: nothing stateful (conventions only). Cache: n/a.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
