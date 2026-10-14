# Review context — T002: Establish the TypeScript workspace

Branch: `feature/platform/t002-establish-the-typescript-workspace` (commit `56c03b1`).

## Changed files

- Root: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Apps: `apps/api`, `apps/worker`, `apps/web` (package.json, tsconfig.json, entry shells)
- Packages: `packages/backend` (11 domain-port stubs + db client/seed),
  `packages/contracts` (api/events/dto Zod schemas), `packages/config` (Zod env)
- Docs: `docs/operations/toolchain.md` (new)

## Behavior

Empty workspace shell: every package builds and typechecks; no business logic.
Internal deps use `workspace:*`; `skills/**` excluded from the pnpm graph.

## Assumptions

- Node >= 20.11, pnpm 9.1.0, TypeScript 5.4. Follow-up finding (recorded T004,
  fixed in T005 scope): backend uses `module ESNext` + `moduleResolution Bundler`
  with `verbatimModuleSyntax: false` so intra-package relative imports resolve;
  NodeNext strictness is kept for api/worker/contracts/config. See toolchain.md.
- `db/*` workspace glob matches no package yet (no package.json under `db/`);
  harmless, reserved for future db tooling packages.

## Risk areas

- Backend `src/platform/index.ts` calls `getSql()` (→ `getEnv()`) at module
  load: importing `@shopscale/backend` root without env throws. Flagged in T004
  review; fix assigned to T005 (config task): lazy connection access.
- ESLint/Prettier/husky described in toolchain.md but not implemented; corrected
  in toolchain.md to land with T008 (CI gates). `pnpm lint` is not runnable yet.

## Verification (exact results, agent host 2026-10-14)

- `pnpm install` — 596 packages, exit 0.
- `pnpm build` — all 6 workspace projects, exit 0 (incl. Next.js static export `/`).
- `pnpm typecheck` — all packages, exit 0.
- `skills/` exclusion: workspace globs (`apps/*`, `packages/*`, `db/*`) do not
  match `skills/`; `pnpm -r` scope is 6 of 7 projects (root excluded).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
