# Review context — T023: Build the token-based component foundation

Branch: `feature/catalog/t023-build-the-token-based-component-foundation`
(parent task; linked subtasks T023a/T023b per the scope rule).

## Changed files

T023a (`9ea4960`): `apps/web/src/styles/tokens.css`,
`apps/web/src/components/theme.ts` (+ `theme.test.ts`),
`apps/web/src/test-setup.ts`, `apps/web/vitest.config.ts`,
`apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`,
`apps/web/package.json` + `pnpm-lock.yaml` (jsdom + Testing Library),
T023a/T023b subtask docs.

T023b (this commit): `apps/web/src/styles/components.css`,
`apps/web/src/components/ui.tsx` (+ `ui.test.tsx`),
`apps/web/src/components/header.tsx`,
`apps/web/src/app/stores/[slug]/layout.tsx`,
`apps/web/src/app/stores/[slug]/page.tsx`,
`tests/e2e/design-system.spec.ts`, `eslint.config.js`, `.gitignore`.

## Behavior

- DESIGN.md §3.1 tokens are copied exactly into `tokens.css`; components
  contain no raw design values. §3.2 type-scale utilities, §5.1 focus ring,
  §8 mobile exceptions (12px gap/pad, 22px radii, 34px display floor), and a
  §9 reduced-motion kill-switch live beside the tokens.
- The tenant bridge is scoped to `[data-tenant]`, not `:root`: a `var()` on
  `:root` would resolve before the wrapper sets `--store-*`, so the override
  would never reach the cards. `TenantScope` emits only the six allowlisted
  `--store-*` variables plus the `radius` value already used by the branded
  storefront, re-validating raw data first (`DEFAULT_THEME` on any mismatch).
- Primitives: Frame, TenantScope, Blocks, Card, IconCircleButton,
  ArrowButton, ActionButton/PrimaryButton/SecondaryButton, Tag/PopularTag,
  RatingBadge, SearchPill, SocialRow, TextField, Footer, plus an outline icon
  set (1.5px, currentColor). Interaction states live in `components.css`
  because inline styles cannot express `:hover`/`:active`/animation. The
  header is a 56px sticky pill that submits search natively to `/search`, so
  it works without JavaScript.

## Decisions (recorded)

- **The T016 theme contract is NOT widened.** DESIGN.md §2 declares a wider
  `TenantTheme` (fonts, gradient stops, swatches, logo, socials) than the
  closed `themeTokensSchema`. T023 maps only the six tokens the validated
  contract can express and leaves the rest at their ShopScale defaults; a
  contract extension needs its own ADR (noted in T023a.md). This is the
  "changes to a shared contract need an ADR" rule taken seriously: no silent
  widening to make the design file line up.
- **Locked tokens never read tenant values.** Radii, spacing, shadows, blur
  and the type scale are tenant-immune; the pre-existing `radius` token keeps
  driving only the branded storefront's inner corners.
- **One shell header for now.** The root layout renders the marketplace
  Frame/Header/Footer; the store route wraps its CONTENT in `TenantScope`
  rather than nesting a second frame + header. Per-tenant chrome (logo and
  wordmark in the header) needs the route's ChannelContext and lands with
  T024 — recorded rather than half-built here.
- **Legacy screens keep rendering.** `globals.css` no longer declares raw
  design values; the pre-T023 variable names map onto tokens. The old
  dark-scheme override is gone because DESIGN.md has no dark theme and its
  cards are explicitly light glass — recorded as a deliberate change.
- **Screenshots without baselines.** `design-system.spec.ts` writes
  screenshots for human inspection but does not enable `toHaveScreenshot`
  pixel diffing: baselines need a recorded bench host with pinned
  fonts/images. Claiming a visual comparison here would be dishonest, so it
  is a recorded pending.
- Tooling: Vitest for the web app gains jsdom + Testing Library and the
  automatic JSX runtime (tsconfig keeps `jsx: preserve` for Next, so esbuild
  otherwise emitted `React.createElement` and every component test died with
  "React is not defined"); the `@/*` alias is mirrored in `vitest.config.ts`;
  ESLint's test block adds `**/*.test.tsx` (first TSX test in the repo).

## Verification (exact results, agent host 2026-10-16)

- Web unit **27/27** across 5 files (11 pre-existing + 16 new component/theme
  tests), exit 0. Lint, workspace typecheck, `next build` and the root
  `pnpm build` all exit 0.
- API integration still 12 files / 49 tests, exit 0 (T018 route-policy gate
  unaffected — no routes changed).
- Playwright `design-system.spec.ts` (token resolution at 390/768/1024/1440,
  both seeded themes, named icon controls, reduced motion, keyboard focus
  ring, inspection screenshots) — written and lint-clean, honestly NOT run:
  no browsers on this host. CI/bench host runs it.

## Risk areas

- The tenant bridge depends on `data-tenant` being on the SAME element that
  carries the inline `--store-*` variables; moving the attribute lower (or
  the style higher) silently stops the theme from reaching descendants.
- `min-height: 100vh` on the frame plus `background: var(--bg-gradient)
  fixed` means very tall pages scroll over a fixed canvas — intentional
  (DESIGN §4) but worth a visual check on the bench host.
- The `.js` → `.tsx` specifier resolution differs between Next (webpack, does
  NOT alias) and Vitest (does): component files therefore import siblings
  through the `@/` alias, and it must stay declared in both tsconfig and the
  Vitest config.

## Learner notes

- Naive: hard-code the reference brand ("nitec.", its photos, its lime) —
  T023 ships tenant-driven tokens and a test that fails on placeholder
  branding.
- Naive: apply `var(--store-accent)` as the design token on `:root` and
  assume it cascades — CSS custom properties substitute where they are
  DECLARED, so the override silently never reaches children. The
  `[data-tenant]` scope is the fix; the test asserts the resolved value.
- Naive: trust the API's theme JSON — an unvalidated `accent` could carry
  `var(--x)` or a URL. Re-validation at the render boundary turns any bad
  value into `DEFAULT_THEME`; the style attribute can only ever hold a flat
  hex.
- What survives a restart: nothing to persist — tokens are CSS and theme
  data is durable Postgres state read per request; a restart changes no
  rendered token.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here.
Nothing merged to `main`/`dev`.
