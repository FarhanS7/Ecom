# ADR-0010: Seller catalog publishing and the console's validation boundary

## Status

Accepted for Milestone 2 (T027). Recorded 2026-10-16 as the contract change
T027 requires; the seller screens cannot satisfy their own acceptance scenario
without it.

## Context

T027's verification scenario is *"Create store-only product, opt into
marketplace, archive; verify public read outcomes after each action."* T020
shipped create (which lands as `draft` with both channel flags off), versioned
edits, per-channel publication toggles, and archive — but **no transition from
`draft` to `active`**. Public reads require `products.status = 'active'`
(`VISIBILITY_WHERE`, T021), so every product a seller authored was permanently
invisible: the milestone exit gate ("products can be authored, published per
channel, browsed") was unreachable through the UI.

The second gap is where validation can live. On scoped store routes the API
deliberately answers **404** for a malformed body, so that "bad input" cannot be
distinguished from "no such store / no membership" (the T018 no-oracle rule). A
404 carries no field information, so field-level errors cannot come from that
API by design.

## Decision

1. **The lifecycle transition rides the existing versioned PATCH** as
   `status: 'draft' | 'active'` on `productUpdateRequest`. `archived` is not an
   accepted value: archival has its own route because it is terminal and must
   preserve order snapshots. No new path, no new gateway entry.
2. **Activating requires at least one active variant.** Prices come from variant
   records and `min_price_cents` is derived from active variants, so publishing a
   variant-less product would advertise a $0 item. The check runs *after* the
   versioned UPDATE inside the same transaction, so a failed activation rolls
   back the version bump too and returns a constant 409 — no phantom version,
   no state change, no oracle (a foreign product already failed the UPDATE with
   404 before the check runs).
3. **An unknown `status` value is malformed input** and shares the route's
   generic 404 (checked in the controller, like every other field on that route).
   The service additionally refuses an unrecognised value so a non-HTTP caller
   cannot reach the `products_status_check` constraint as a 500.
4. **`min_price_cents` is refreshed whenever `status` is part of a patch**, so a
   published product never carries a stale derived price.
5. **The seller console validates on the Next server against the shared contract
   schemas** (server actions) and returns field-keyed errors plus the entered
   values. It calls the API server-to-server with the session cookie, exactly
   like the existing `/v1/auth/me` read. **No seller write path is added to the
   gateway allowlist**: the browser cannot reach the seller write API directly
   even if a client ignores the UI, and validation cannot be bypassed.
6. **Version conflicts are a UX flow, not an error wall.** A 409 re-reads the
   product and offers "reload latest" or "apply my changes" (retry with the fresh
   version), so optimistic concurrency stays explicit and recoverable.

## Alternatives considered

- **A dedicated `POST /:productId/publish` route.** More surface with identical
  semantics, and `publication` already exists for per-channel flags — a second
  "publish" verb would be ambiguous about which axis it moves.
- **Browser-side validation only.** Bypassable, and it is not "server
  validation"; the acceptance criterion would be satisfied in appearance only.
- **Changing the scoped-route 404 rule to 422 for malformed bodies.** It would
  oracle store existence, undoing the T018 matrix convention.
- **Letting the API return field errors.** Rejected for the same reason.

## Consequences

- Products cannot leave `archived` (unchanged; archive remains terminal).
- A seller must add a variant before publishing — the negative path is now an
  explicit, tested product rule rather than a silent $0 listing.
- The seller console needs JavaScript for its forms (server actions are invoked
  from event handlers); the pages themselves are still server-rendered, and the
  private-data rule ("explicit uncached requests") is honoured with
  `cache: 'no-store'`.
- Seller pages are reached by URL (`/seller/{storeId}/products`) because no
  "my stores" endpoint exists yet; the store id comes from the onboarding or
  invitation response. A `/v1/me/stores` read is future work (recorded as a
  known limitation in the T027 context).

## Validation

- Contract: `packages/contracts/src/catalog.test.ts` (status accepted/refused).
- Live HTTP: `apps/api/tests/integration/catalog-write.spec.ts` — create →
  publish (blocked without a variant, then allowed) → store-channel visible
  while the marketplace stays 404 → marketplace opt-in → marketplace unlisting
  keeps store visibility → archive → both channels 404.
- Web: `features/seller/validation.test.ts` (field errors + value preservation)
  and the seller client tests (409 → conflict with a re-read).

Related: [catalog module](../modules/catalog.md),
[REST contracts](../architecture/api-contracts.md),
[data model](../architecture/data-model.md), [T027](../../tasks/items/T027.md).
