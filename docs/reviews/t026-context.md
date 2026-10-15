# Review context — T026: Build product detail and variant selection

Subtasks: [T026a](../../tasks/items/T026a.md) (detail-read path mapping +
server-only loader) and [T026b](../../tasks/items/T026b.md) (PDP presentation,
variant picker, route pair, batteries).

## Changed files

T026a (`2ed2b14`)

- `apps/web/src/features/catalog/load.ts` + `load.test.ts` — new
- `apps/web/src/features/catalog/query-state.ts` + `.test.ts` — path builders
- `tasks/items/T026a.md`, `tasks/items/T026b.md` — subtask specs

T026b (this commit)

- `apps/web/src/features/catalog/variants.ts` + `variants.test.ts` — new (pure)
- `apps/web/src/features/catalog/variant-picker.tsx` — new
- `apps/web/src/features/catalog/product-detail.tsx` + `.test.tsx` — new
- `apps/web/src/app/products/[slug]/page.tsx` — new (marketplace PDP)
- `apps/web/src/app/stores/[slug]/products/[product]/page.tsx` — new (store PDP)
- `apps/web/src/components/ui.tsx` — `ActionButton.describedBy`
- `apps/web/src/styles/components.css` — PDP/variant styles
- `apps/web/src/features/catalog/{load.ts,load.test.ts,query-state.test.ts,product-list.tsx}`
  — `productPagePath` moved from the loader (which is server-only) into the pure
  module, and the T025 routes/island now derive every base path from it
- `tests/e2e/product-detail.spec.ts` — new (bench host only)

## Behavior

- Both PDP routes are server-rendered (title, price, description, attributes in
  the HTML) and channel-scoped: `/products/{slug}` reads the marketplace
  endpoint, `/stores/{slug}/products/{product}` reads that store's endpoint and
  passes the resolved store slug down.
- The variant choice lives in `?variant=`: the server resolves it against THIS
  product and seeds the island; the island updates the URL on change, so the
  view is shareable and survives a reload. React state is only a cache of it.
- Native radios in one group (visually hidden, pill as the label) give arrow-key
  selection and a single tab stop; the focus ring is drawn on the pill via
  `:focus-within` because the input itself is visually hidden.
- The purchase CTA is disabled with one honest reason from `purchaseState`
  (no-variant vs checkout-not-connected), tied to the control with
  `aria-describedby`.

## Decisions (recorded)

1. Route segment is `[slug]`, not the task's suggested `[id]`: the API's detail
   endpoint takes `:productSlug`, and T025's listing already emits
   `/products/{slug}`. Recorded in `T026b.md`.
2. Three outcomes, never a fourth. A definite 404 (or a slug the API's own
   pattern rejects) is a 404; a transport failure, a non-404 status, or a body
   that fails `channelProductDetail` renders an honest 200 "temporarily
   unavailable" card. A 404 is an assertion about the world, and an outage is
   not evidence of absence; the unavailable response is identical for every
   slug, so it is not an oracle for a specific product either.
3. "Product scope matches route" is enforced, not assumed: the loader rejects a
   store-scoped response whose `store.slug` differs from the route's store
   (→ not-found), with a unit test.
4. No gateway allowlist entry: the PDP is fetched server-side, so the
   browser-facing allowlist stays at the two listing templates from T025.
5. Availability is not modelled yet (inventory is T032, the cart T033), so
   `purchaseState` returns two DISTINCT honest reasons and the product-level
   branch (no active variant) is real data today. When the cart lands, only
   `CHECKOUT_CONNECTED` flips; the UI code does not change.
6. `productPagePath` lives in the pure module rather than the loader: importing
   the loader into a client component would pull server config (`API_BASE_URL`)
   into the browser bundle. The T025 island and routes now use it, so link shape
   has one owner per channel.
7. Deliberately omitted from the PDP: a "Buy now" button (no checkout),
   a quantity stepper (no cart), and a reviews card (no review data) — each
   would be a decorative control pretending to be connected.
8. `ActionButton` gained a single optional `describedBy` prop so a disabled
   action can point at its visible reason instead of hand-rolling a button.

## Verification (exact results, agent host 2026-10-16)

| Check | Result |
| --- | --- |
| `pnpm --filter=@shopscale/web run test:unit` | 12 files, 100 tests passed (70 → 100; +10 T026a, +20 T026b) |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm --filter=@shopscale/web run build` | exit 0; `/products/[slug]` and `/stores/[slug]/products/[product]` emit as dynamic (ƒ) |
| `next start` with an unreachable `API_BASE_URL` — `GET /products/x-bud` | 200; `<h1 id="pdp-unavailable">This product is temporarily unavailable</h1>`, `role="alert"` text "We could not reach the catalog just now. Please try again shortly.", the secondary "Back to products" link, and no "does not exist"/"not found" wording anywhere |
| `next start` — `GET /products/UPPER_bad` | 404 (the API's own product-slug pattern rejects it) |
| `next start` — `GET /products/..%2Fetc%2Fpasswd` | 404 |
| `next start` — `GET /stores/t016-alpha/products/x-bud` | 404 (the store cannot be resolved without the API, so the layout 404s before the page) |
| `next start` — `GET /products` (regression) | 200, filter card present |

Unit evidence for the acceptance criteria that need no browser:

- "Selected variant changes displayed price" — `product-detail.test.tsx` clicks
  the second variant and asserts the price element's text changes and that the
  URL write is `/products/x-bud?variant=<id>` with `scroll: false`.
- "Unavailable variants disable purchase action" — the CTA is disabled for both
  reasons, the reason text is visible, and `aria-describedby` points at it;
  `variants.test.ts` proves the two reasons are distinct.
- "Product scope matches route" — `load.test.ts` (foreign store → not-found),
  `query-state.test.ts` (a store's page path and request path share the same
  channel segment), and the e2e cross-store checks on the bench host.
- "No cross-store cache reuse" — `load.test.ts` asserts two stores produce two
  different requests, and `cache: 'no-store'` is asserted on the fetch init.

## Risk areas

- The PDP renders **without JavaScript** (proven by the JS-disabled e2e block),
  unlike the listing island from T025 — a deliberate difference.
- The unavailable-vs-404 split means an unreachable catalog renders 200 on a
  PDP. That is the honest answer, but it is a behavioral difference from the
  store PLP/PDP layout, which 404s when the store itself cannot be resolved.
- Expected prices in the e2e spec are read from the API, and price-change
  assertions are skipped when the seeded variants share a price, so the spec
  cannot pass by agreeing with the component's own formatter.

## Learner notes

- "Which state survives a restart, and which is only a cache?" — the selected
  variant survives because it is in the URL; the React state that mirrors it is
  a cache that the server re-seeds on every render. A pure `useState`-only
  picker would lose the choice on reload and could not be deep-linked.
- The naive implementation would resolve `?variant=` by looking it up in the
  presented list without checking ownership, or would trust `product.store`
  instead of the route. The tests that catch those are, respectively,
  "falls back to the first variant for anything else" and "refuses a product
  that belongs to another store".

## Independent review report

Not yet produced. A fresh-context reviewer was not available on this host, so
the self-review above is recorded as-is rather than implying an independent pass.
