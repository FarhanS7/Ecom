# Review context — T027: Build seller catalog editing screens

Subtasks: [T027a](../../tasks/items/T027a.md) (backend publish transition),
[T027b](../../tasks/items/T027b.md) (seller data access, validation, server
actions) and [T027c](../../tasks/items/T027c.md) (console screens, routes,
batteries).

Contract change: [ADR-0010](../../decisions/0010-seller-catalog-publishing.md).

## Changed files

T027a (`bd73c35`)

- `packages/contracts/src/catalog.ts` + `catalog.test.ts` — `productUpdateRequest`
  gains an optional `status: 'draft' | 'active'`
- `packages/backend/src/catalog/product.service.ts` — `UPDATABLE`/`status` patch,
  `assertHasActiveVariant`, `refreshMinPrice`, duplicate-slug → 409
- `apps/api/src/product.controller.ts` — no new route; the existing PATCH passes
  `status` through
- `apps/api/tests/integration/catalog-write.spec.ts` — lifecycle + duplicate slug
- `docs/decisions/0010-seller-catalog-publishing.md` — new
- `tasks/items/T027.md`, `T027a.md`, `T027b.md`, `T027c.md` — subtask specs

T027b (`1516ec7`)

- `apps/web/src/features/seller/client.ts` — server-only write transport
- `apps/web/src/features/seller/validation.ts` + `.test.ts` — pure form rules
- `apps/web/src/features/seller/state.ts` — `SellerFailure`/save-state unions
- `apps/web/src/features/seller/actions.ts` + `.test.ts` — server actions
- `apps/web/src/features/seller/load.ts` + `.test.ts` — membership + reads

T027c (this commit)

- `apps/web/src/features/seller/product-form.tsx` + `.test.tsx` — new
- `apps/web/src/features/seller/variant-table.tsx` + `.test.tsx` — new
- `apps/web/src/features/seller/publication-controls.tsx` + `.test.tsx` — new
- `apps/web/src/features/seller/product-workspace.tsx` + `.test.tsx` — new
- `apps/web/src/features/seller/{notices.tsx,product-badges.tsx}` — new
- `apps/web/src/app/seller/[storeId]/layout.tsx` — new
- `apps/web/src/app/seller/[storeId]/products/page.tsx` — new
- `apps/web/src/app/seller/[storeId]/products/[productId]/page.tsx` — new
- `apps/web/src/components/ui.tsx` — `TextAreaField`, `SelectField`
- `apps/web/src/styles/components.css` — console styles
- `tests/e2e/seller-catalog.spec.ts` — new (bench host only)

## Behavior

- Membership is resolved **on the server** in the layout, once per request, with
  the caller's cookies; the console never fetches the seller API from the
  browser. A guest sees a sign-in prompt, never an empty shell.
- One generic 404 covers malformed store ids, non-members and members without
  `catalog:manage` — the console repeats the API's own no-oracle answer instead
  of inventing a nicer one.
- Editing happens through server actions against the store-scoped endpoints. The
  product version is the concurrency token; the conflict path offers the only two
  honest choices: "Reload latest" (adopt the other writer's values) or "Apply my
  changes" (re-send mine on top of the fresh version).
- Publishing requires an active variant, and the refusal is checked *after* the
  versioned UPDATE inside the same transaction, so the version bump is rolled
  back with it and a refused publish cannot be used to probe or bump a product.
- Channels are independent booleans toggled one at a time; a channel can be on
  for a draft (the UI says "on (not live)" rather than pretending it is listed).
  Archive is terminal and asks twice.

## Decisions (recorded)

1. **The contract change lives in the PATCH body, not in a new route.** A new
   `POST /products/:id/publish` would have needed a gateway allowlist entry and a
   second concurrency protocol for the same counter. ADR-0010 records the choice
   and the rejected alternatives.
2. **Activate-then-verify inside the transaction.** The active-variant guard runs
   after the versioned UPDATE; a refusal rolls back and returns a constant 409, so
   there is no phantom version bump and no oracle for "does this product exist".
3. **A variant write is gated by the PRODUCT's version but returns only the
   variant**, so the client pulls the fresh product from the response envelope and
   adopts it. If only that refresh fails, the save is still reported as a save —
   with an explicit "reload before the next change" warning, never a fake failure.
4. **One product state for all three panels** (`ProductWorkspace`). Both of these
   bugs were found by the jsdom tests and fixed before commit:
   - `publication-controls` stored the *bound* retry request, so "Apply my
     changes" re-sent the stale version and conflicted forever; it now rebuilds
     the request against the current version.
   - `product-form` kept its own copy of the version; a variant write bumps the
     product's version, so the next product-field save would have conflicted
     without the seller doing anything wrong. The workspace's product is now the
     only source of truth (`product-workspace.test.tsx` pins both).
5. **Seller validation runs on the Next server, using the shared contract
   schemas.** The browser never gets a write path to the API: no allowlist entry
   is added, so the seller write surface stays unreachable from the public
   gateway.
6. **Duplicate slug is a conflict, not a crash.** `createProduct` maps the scoped
   unique violation to `CatalogError('CONFLICT', 'Slug already exists in this
   store.')`, matching the already-handled duplicate SKU; the UI puts the message
   on the slug field (create-time only conflict, so there is nothing to reload).
7. **Archived products disable every control with a visible reason** via
   `aria-describedby`, rather than hiding the controls and leaving the seller to
   guess why.
8. **Buttons, not checkboxes, for channel toggles** — each toggle is an explicit
   action with its own pending state, so a half-applied pair is impossible.

## Verification (exact results, agent host 2026-10-16)

T027a (`bd73c35`)

| Check | Result |
| --- | --- |
| `pnpm --filter=@shopscale/contracts run test` + build | exit 0 |
| `pnpm --filter=@shopscale/backend run test/lint/typecheck/build` | exit 0 |
| `pnpm --filter=@shopscale/api run lint/typecheck/build` | exit 0 |
| API integration (`catalog-write.spec.ts`, live DB) | 12 files / 50 tests; the live-DB specs print honest `SKIP:` lines on this host |
| `pnpm openapi` | no drift in `docs/openapi.json` — the PATCH body stays untyped and no path is added |

T027b (`1516ec7`)

| Check | Result |
| --- | --- |
| `pnpm --filter=@shopscale/web run test:unit` | 15 files, 142 tests passed |
| `pnpm --filter=@shopscale/web run typecheck` | exit 0 |
| `pnpm lint` | exit 0 |

T027c (this commit)

| Check | Result |
| --- | --- |
| `pnpm --filter=@shopscale/web run test:unit` | 19 files, **173 tests passed** (142 → 173) |
| `pnpm lint` | exit 0 |
| `pnpm --filter=@shopscale/web run typecheck` | exit 0 |
| `pnpm --filter=@shopscale/web run build` | exit 0; `/seller/[storeId]/products` (183 B) and `/seller/[storeId]/products/[productId]` (3.35 kB) emit as dynamic (ƒ) |
| `next start` with an unreachable `API_BASE_URL` — `GET /seller/1111…/products` | 200; the store-console unavailable card, `role="alert"` present, and **no** "not found"/"does not exist"/"No products yet" wording |
| `next start` — `GET /seller/1111…/products/2222…` | 200; same unavailable card |
| `next start` — `GET /seller/not-a-uuid/products` | 404 (the loader rejects it before any request) |
| `next start` — `GET /seller/..%2Fetc%2Fpasswd/products` | 404 |
| `next start` — `GET /products` (regression) | 200 |
| `next start` against a stub API answering **only 401** — `GET /seller/1111…/products` | 200; "Sign in to manage your store" + "Go to sign in", and no console markup |
| same, `GET /seller/1111…/products/2222…` | 200; the sign-in prompt and **none** of "Product details"/"Variants"/"Publication" |

Unit evidence for the criteria that need no browser:

- Validation summary + per-field errors, values preserved, error clears on edit —
  `product-form.test.tsx` (the message appears twice by design: summary and
  inline).
- Conflict panel — `product-form.test.tsx` (reload/apply) and
  `variant-table.test.tsx` (a variant conflict has no current variant to reload,
  so only retry is offered).
- Version adoption — `product-workspace.test.tsx`: a variant write bumps the
  product to v3 and the next lifecycle action sends `expectedVersion: 3`; a
  product save adopts v3 and the next one sends v3.
- Honest empties — `variant-table.test.tsx` distinguishes "needs at least one
  active variant" from "could not be loaded".
- Channels independent + archive two-step — `publication-controls.test.tsx`.

## Risk areas and known limitations

- **The console needs JavaScript** for every mutation (server actions). The SSR
  HTML carries the list, the panels and the honest gate states, so the screens
  are readable and the failure modes are visible without JS, but nothing can be
  saved. Recorded rather than hidden; a `<noscript>` note would be the follow-up
  if a no-JS requirement ever appears.
- **No category picker yet.** There is no categories feed (T030+), so the create
  form omits `categoryId` and updates never change it. `updateProduct` accepts it
  freely when it is sent, so the FK-failure path is still unhandled — a known gap
  for the categories task, not a regression.
- **No store picker.** There is no `/v1/me/stores` slug→id listing yet, so the
  console is reached with a known store id (`/seller/{storeId}/...`). The nesting
  is deliberately `[storeId]` so a store index can be added above it later
  without moving these routes.
- **Segment reads are independent.** Next renders the page even when the layout
  short-circuits, so an outage on a gated route costs one extra API read. No data
  is exposed: every read is authorized separately with the same cookie, and the
  gate cards contain no store or product data.
- **The e2e spec is unrun here.** It needs browsers, a live stack and a
  provisioned store member (`SELLER_E2E_EMAIL/PASSWORD/STORE_ID/STORE_SLUG`, plus
  optional viewer credentials for the permission case). It skips with that exact
  reason instead of passing vacuously; the signed-out test needs no provisioning
  and runs against any stack.

## Pendings (declared, not claimed)

- Playwright runs (`seller-catalog`, plus the earlier `product-list`,
  `product-detail`, `storefront-home`) — no browsers on this host.
- Visual baseline diffing for the console screens.
- An independent review: no distinct-model reviewer was available in a fresh
  session here, so this document is the self-review and says so.

## Learner notes

- "What survives a restart, and what is only a cache?" — the product and its
  version survive (they are the API's rows); `ProductWorkspace`'s state is a cache
  of the last authoritative response, which is exactly why the version must flow
  through it instead of being copied into each panel.
- The naive implementation would let each screen own its own product version and
  its own copy of the retry request. Both look fine until a second write happens:
  the first makes a legitimate save conflict, the second makes a recovery retry
  impossible. The tests that catch them are the two in `product-workspace.test.tsx`
  and "shows a refused publish with its reason and retries on the fresh version".
- The naive publish check would run *before* the UPDATE (an oracle: "409 means
  this product exists and has no active variant") or outside the transaction (a
  phantom version bump on a refused publish). `assertHasActiveVariant` runs last,
  inside the same transaction, with constant responses.
