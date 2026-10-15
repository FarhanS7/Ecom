# Review context — T025: Build product listing and filters

Subtasks: [T025a](../../tasks/items/T025a.md) (URL/request contract +
stale-request guard) and [T025b](../../tasks/items/T025b.md) (filter panel,
listing island, PLP routes, batteries). Split because T025 exceeded one focused
session; T025 stays the parent ID.

## Changed files

T025a (`4a7d344`)

- `apps/web/src/features/catalog/query-state.ts` — new (pure)
- `apps/web/src/features/catalog/query-state.test.ts` — new (17 tests)
- `apps/web/src/lib/api.ts` + `api.test.ts` — catalog read templates
- `apps/web/src/styles/components.css` — PLP/filter/skeleton styles
- `tasks/items/T025a.md`, `tasks/items/T025b.md` — subtask specs

T025b (this commit)

- `apps/web/src/features/catalog/filter-panel.tsx` + `.test.tsx` — new
- `apps/web/src/features/catalog/product-list.tsx` + `.test.tsx` — new
- `apps/web/src/app/products/page.tsx` — new (marketplace PLP)
- `apps/web/src/app/stores/[slug]/products/page.tsx` — new (store PLP)
- `apps/web/src/lib/price.ts` — new (money formatter, shared)
- `apps/web/src/features/storefront/home.tsx` — re-exports `formatPrice`
- `tests/e2e/product-list.spec.ts` — new (bench host only)

## Behavior

- The URL is the single source of truth: `category`, `min`/`max` (major units),
  `sort`, and the cursor stack `after` round-trip through `parseListQuery` /
  `serializeListQuery`. Defaults are omitted, so URLs stay canonical and
  shareable; the same filters survive Back/Forward because nothing is stored in
  component state.
- The channel is in every request by construction: `listApiPath` is the only
  place a channel becomes a path, and the browser URL (`/api/...`) is built from
  it. A store channel with an empty slug THROWS rather than falling back to the
  marketplace endpoint.
- Filter changes drop the cursor stack (`withFilters`): a cursor is bound to the
  filter fingerprint it was issued for (T022), so carrying it across a filter
  change would ask for a page of a result set that no longer exists.
- The listing island fetches one page at a time with an `AbortController` plus a
  `LatestRequest` token; only the newest token may commit, so a slow older
  response cannot overwrite a newer selection even if abort is ignored.
- States: skeleton cards while loading (never a spinner inside a card), an
  announced `role="alert"` failure with retry, an honest empty state that
  offers "Clear filters", and the grid with cursor Next/Previous.

## Decisions (recorded)

1. Gateway allowlist: the deferred T021b extension landed here as
   `ALLOWED_GATEWAY_TEMPLATES` with exact-shape matching, because the existing
   one-extra-segment prefix rule cannot express `/v1/catalog/stores/{slug}/
   products`. Depth and literals are exact, so `…/products/extra`,
   `v1/catalog/admin/products`, and any write shape stay rejected; per-segment
   validation still blocks traversal and absolute URLs.
2. Client-fetched listing (architecture assigns filters to client components).
   The server renders the shell — heading, filter card, honest loading region —
   which is what the runtime check below proves; without JavaScript the results
   region stays in its loading state. Recorded as a known limitation rather than
   claimed as covered: a server-rendered first page is a possible refinement.
3. Category filtering is URL/deep-link driven plus a slug pill input, because
   there is still no public categories endpoint. `FilterPanel` accepts an
   optional `categories` list and renders chips instead of the text input when a
   future task supplies one.
4. Price filters are typed in MAJOR units in the URL (human-typable, deep-link
   friendly) and converted to cents only in `toApiSearchParams`; the API never
   sees an unvalidated value.
5. Pagination state is the whole cursor stack in `after` (comma-separated
   base64url). Previous is then a pure URL transformation instead of a client
   history stack, and both directions are deep-linkable.
6. `CURSOR_PATTERN` guards both entry points (URL parse and the API response
   cursor): a malformed cursor drops the stack / is not sent upstream, so a
   buggy or hostile response cannot put arbitrary text into a link or a query.
7. `formatPrice` moved to `lib/price.ts` and is re-exported from
   `features/storefront/home` — one money formatter for home and PLP instead of
   a cross-feature import.

## Verification (exact results, agent host 2026-10-16)

| Check | Result |
| --- | --- |
| `pnpm --filter=@shopscale/web run test:unit` | 9 files, 70 tests passed (35 → 70; +17 T025a, +18 T025b) |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 (6 workspace projects) |
| `pnpm --filter=@shopscale/web run build` | exit 0; `/products` and `/stores/[slug]/products` emit as dynamic (ƒ) |
| `next start`, no API reachable — `GET /products` | 200; `>All products</h1>`, `aria-labelledby="filters-heading"`, sort pills, `ss-plp__results" aria-busy="true"`, 6 × `class="ss-skeleton"`, `role="status">Loading products<` |
| `next start` — `GET /products?sort=popularity&min=10&max=20` | 200; the Popular pill is `aria-current="true"` with the canonical href, `filter-min`/`filter-max` seeded with 10/20, `>Clear filters<` offered |
| `next start` — `GET /stores/t016-alpha/products` | 404 (unknown and unavailable stay indistinguishable without the API) |
| `next start` — `GET /stores/UPPER_bad!!/products` | 404 |

Unit evidence for the acceptance criteria that need no browser:

- "channel remains in every API request" — `query-state.test.ts` asserts the
  marketplace and store paths and the empty-slug refusal;
  `product-list.test.tsx` asserts the exact fetched URL for both channels, the
  store-scoped product href, and the filters/cursor it forwards.
- "stale requests cannot overwrite newer selections" — `product-list.test.tsx`
  resolves the NEWER request first, then the older one, and asserts the older
  rows never render; a second test asserts the previous request was aborted.
- "back/forward preserves filters" — pure URL round-trip tests, plus the e2e
  Back/Forward test (bench host).

## Risk areas

- The PLP is a client island: without JavaScript the results region stays in
  its loading state even though the shell renders. Deliberate (decision 2) and
  visible in the SSR capture above.
- `next/navigation` is mocked in the jsdom tests, so the island's contract with
  the router (push on filter change, URL-driven refetch) is proven by the e2e
  spec on the bench host, not by unit tests.
- The e2e assertions branch on how many products the seed has (0 vs N) so they
  stay truthful on an unseeded database; the channel-scoped URL check runs
  either way.

## Learner notes

- Keyset pagination and filters interact: the API rejects a cursor issued for a
  different filter set (T022 fingerprint), which is why every filter change must
  reset the stack. The client enforces it in `withFilters` rather than letting
  users meet an unexplained 422.
- Validation belongs at the boundary. One parser (`parseListQuery`) is used for
  inbound URLs AND for the values a form is about to write, so an invalid value
  can never reach the URL, and the API only ever sees cents and closed enums.

## Independent review report

Not yet produced. The task rules ask for a fresh-context reviewer; no separate
model/session was available on this host, so the self-review above is recorded
as-is instead of implying an independent pass.
