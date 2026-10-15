# Review context — T024: Build connected storefront home pages

Branch: `feature/catalog/t024-build-connected-storefront-home-pages`
(parent task; linked subtasks T024a/T024b per the scope rule).

## Changed files

T024a (`eed3d40`): `apps/web/src/features/storefront/hero.tsx`,
`apps/web/src/features/storefront/home.tsx` (+ `home.test.tsx`),
`apps/web/src/components/ui.tsx` (`ProductCard`, `CardArrow`),
`apps/web/src/styles/components.css`, T024a/T024b subtask docs.

T024b (this commit): `apps/web/src/features/storefront/load.ts`,
`apps/web/src/app/page.tsx`, `apps/web/src/app/stores/[slug]/page.tsx`,
`apps/web/src/app/stores/[slug]/layout.tsx`,
`tests/e2e/storefront-home.spec.ts`.

## Behavior

- ONE home component serves both channels (`StorefrontHome({content})`), and
  the channel decides every link shape in one place (`productHref` /
  `listingHref`): marketplace → `/products/…`, store →
  `/stores/{slug}/products/…`. No duplicated domain logic per channel
  (frontend.md).
- Products are REAL: the marketplace home and each store home render the T021
  public channel reads server-side, and every card is a single anchor to a
  product route. Until media lands (T035) the image slot is an explicit neutral
  tile — never a fabricated product photo.
- Empty and unavailable are different states. A reachable-but-empty catalog
  says "No products are published yet."; an unreachable/malformed API says "The
  catalog is temporarily unavailable." and still renders the hero. Missing
  blocks are dropped so neighbours reflow — no empty card shells.
- Theme loads before first render: the theme tokens are validated in the
  store layout's server fetch (`loadStoreChannel`, shared with the page via
  React `cache()` so it is ONE fetch per request) and inlined onto the
  `[data-tenant]` wrapper, so there is no flash and no shift.

## Decisions (recorded)

- **Shell contract kept.** The marketplace home became product-first but still
  renders the server-side health state and the gateway probe with their
  original testids, so the T007 `shell.spec.ts` journey keeps passing instead
  of being rewritten by an unrelated task.
- **Hero owns the h1.** The store layout stopped rendering its own `<h1>`; the
  hero card's headline is the page's single h1 (one h1 per page, and the store
  name is still visible in it). Per-tenant header chrome stays deferred to the
  ChannelContext work.
- **No public category feed exists yet.** `categories` is part of
  `HomeContent` and the category block renders real `?category=` links when
  supplied, but no public categories endpoint ships in T019–T021, so the
  channel loaders pass `[]` and the block reflows away. Inventing an endpoint
  to make the block appear would be out of scope for this task.
- **Gateway allowlist still deferred to T025.** T021b's note said T024; T024
  reads server-side, so the first BROWSER catalog call is T025's filters.
  Corrected in T024b.md with the reason.
- **Links are asserted, not followed, in e2e.** The PLP and PDP routes arrive
  with T025/T026, so navigating to them would 404 today. The spec asserts the
  documented targets, and still exercises a real navigation where the route
  exists (store → marketplace).

## Verification (exact results, agent host 2026-10-16)

- Web unit **35/35** across 6 files (8 new home tests), exit 0. Lint,
  workspace typecheck, `next build` and root `pnpm build` all exit 0.
- **Runtime server-render check (real evidence, no API running).** Started the
  production server (`next start`) with NO API reachable and fetched pages:
  - `GET /` → **200**; hero headline "ShopScale Marketplace" present; the CTA
    renders `href="/products"`; the honest "temporarily unavailable" message
    present; **0** product tiles; `api-liveness` and `gateway-probe` testids
    still present.
  - `GET /stores/t016-alpha` → **404** (channel unavailable → notFound, no
    crash); `GET /stores/UPPER_bad!!` → **404** (slug rejected before fetch).
  This proves the degrade path and the 404 boundaries end-to-end; it does NOT
  prove the populated store home.
- Playwright `storefront-home.spec.ts` (marketplace + two store homes + empty
  reflow + cross-link navigation + focus ring) — written and lint-clean,
  honestly NOT run: no browsers on this host. The populated happy path
  (real products, real themes) therefore remains CI/bench-host evidence.

## Risk areas

- `loadHomeContent` treats a contract-validation failure as an outage. That is
  deliberate (never render unvalidated data) but it means a contract drift
  surfaces as "temporarily unavailable"; the API integration tests and the
  shared contract schema are what catch drift first.
- `React.cache()` dedupes per request only. A future need to read the channel
  OUTSIDE a request (e.g. a background job) must not reuse this helper.
- The e2e assertions branch on whether products exist, so they cannot detect a
  seeded-data regression by themselves; the presentation contract is pinned by
  the jsdom tests with explicit fixtures.

## Learner notes

- Naive: copy the marketplace page into a store page and swap the base URL —
  the two channels then drift and one starts leaking the other's links. The
  single `productHref`/`listingHref` pair is the fix; the tests assert the
  channel-correct href, which is exactly what a copy-paste bug breaks.
- Naive: render a skeleton card per expected product when the fetch fails →
  the page looks "connected" while lying. Missing data reflows, and an outage
  says so.
- Naive: `fetch` without validating the body → a contract change renders
  `undefined` prices. `channelListResponse.safeParse` at the boundary turns it
  into the outage state.
- What survives a restart: nothing in the web tier; the content is rebuilt from
  the API on every request (`dynamic = 'force-dynamic'`, `cache: 'no-store'`),
  so a restart changes nothing except losing any warm fetch cache.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here.
Nothing merged to `main`/`dev`.
