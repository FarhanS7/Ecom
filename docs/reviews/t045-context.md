# Independent Review: TASK-045 Implement Totals and Coupon Allocation Contracts

## Overview
- **Task ID**: `TASK-045`
- **Scope**: Canonical quote calculation engine computing seller-subtotals, fixed shipping ($5.00/500 cents per seller), proportional coupon allocation with zero penny-loss rounding, and price-change verification (409 PRICE_CHANGED). Issues cryptographically signed HMAC-SHA256 quote tokens with 15-minute TTL.
- **Reviewer**: Technical Lead / Independent Review Pass
- **Risk Level**: MEDIUM
- **Status**: PASSED

---

## 1. Mathematical Invariant & Penny-Rounding Verification

### Core Problem
When distributing integer coupon discounts (e.g. 1000 cents / $10.00) across $N$ line items with non-divisible prices or odd counts (e.g. 3 items of equal price $10.00 each), naïve division `floor(total / N)` produces $333 \times 3 = 999$ cents, leaking 1 cent. Floating point operations introduce binary fractional inaccuracies (e.g. `0.1 + 0.2 = 0.30000000000000004`).

### Proportional Allocation Algorithm (`allocateDiscountsProportionally`)
1. **Integer Arithmetic**:
   - For each item $i$, compute its exact fractional share:
     $$\text{raw} = \frac{\text{effectiveDiscount} \times \text{item.subtotalCents}}{\text{basketSubtotal}}$$
   - Allocate the base floor: $\text{base}_i = \lfloor\text{raw}\rfloor$.
   - Compute fractional remainder: $\text{frac}_i = \text{raw} - \text{base}_i$.
2. **Deterministic Remainder Penny Distribution**:
   - Sum initial allocations: $S = \sum \text{base}_i$.
   - Calculate remaining pennies: $R = \text{effectiveDiscount} - S$.
   - Sort items descending by $\text{frac}_i$ (with secondary stable tie-break on item ID).
   - Distribute 1 extra penny to each of the top $R$ items.
3. **Formal Invariant Guarantee**:
   $$\sum_{i=1}^N \text{allocated}_i \equiv \text{effectiveDiscount}$$
   - Tested under 3 equal items with 1000 cents discount: allocations are strictly $334, 333, 333$, summing to exactly 1000.
   - Tested under varying item weights ($10, $20, $30 with $10 discount): sum is strictly 1000.
   - Tested with discount exceeding basket subtotal: clamped to subtotal without producing negative prices.

---

## 2. Multi-Seller Shipping & Marketplace Aggregation

### Shipping Rules
- Fixed demo shipping of 500 cents ($5.00) is assessed strictly per unique `store_id`.
- For marketplace baskets containing products across $K$ sellers:
  $$\text{shippingCents} = K \times 500$$
- Tested: 2 distinct sellers produce 1000 cents ($10.00) total shipping, with each seller suborder carrying 500 cents shipping.

### Order Breakdown Structure
Line items are grouped by `store_id` into seller suborder objects containing:
- `storeId`, `storeName`
- `subtotalCents`, `shippingCents`, `discountCents`, `totalCents`
- `items`: line item list with unit price, quantity, line total, and allocated discount.

---

## 3. Price-Change Verification & Security Guarantees (CA-3)

### Catalog Verification
- When a client passes `expectedUnitPriceCents` in the quote request (e.g. from cart or PDP display state), the service compares it against `product_variants.price_cents` fetched directly from the database:
  - If identical: quote proceeds normally.
  - If different: immediately aborts with `PriceChangedError` (translated by `CommerceController` into HTTP 409 Conflict with `{ error: 'PRICE_CHANGED', variantId, expectedPriceCents, currentPriceCents }`).
- Client cannot proceed with checkout using stale prices.

### Cryptographic Quote Signing
- Quotes issue an HMAC-SHA256 signed `quoteToken` encompassing:
  `quoteId`, `channelKey`, `subtotalCents`, `shippingCents`, `discountCents`, `totalCents`, `expiresAt`, `couponCode`, items, and seller breakdowns.
- Expiration is set to 15 minutes (`QUOTE_TTL_SECONDS = 900`).
- Token verification enforces:
  - Timing-safe HMAC equality (`crypto.timingSafeEqual`)
  - Expiration timestamp check
  - Structural validation
- Tampered or expired tokens throw `InvalidQuoteTokenError`.

---

## 4. Test Verification Summary

| Test Suite | Tests | Result |
|---|---|---|
| `packages/backend/src/commerce/quote.service.test.ts` | 12 | PASSED |
| `apps/api/src/commerce.controller.test.ts` | 5 | PASSED |
| `apps/web/src/lib/api.test.ts` | 5 | PASSED |
| `packages/backend/tests/integration/quote.spec.ts` | 3 | PASSED |
| `apps/api/tests/integration/permission-matrix.spec.ts` | 7 | PASSED |
| Full Workspace Unit Suite (`pnpm test`) | 462 | PASSED |
| Full Repository Lint (`pnpm lint`) | 0 warnings, 0 errors | PASSED |
| Full Repository Build (`pnpm build`) | All 6 packages | PASSED |

---

## 5. Review Findings & Resolution
- **Finding 1 (Fixed)**: In `apps/api/src/commerce.controller.ts`, `InvalidCouponError` had `couponCode` instead of `code`. Added `public readonly code: string` to `InvalidCouponError` and referenced `err.couponCode` in the controller.
- **Finding 2 (Fixed)**: Route policy completeness check (`findUndocumentedRoutes`) caught missing `POST /v1/checkout/quote` entry in `docs/openapi.json`. Added complete OpenAPI specification for `/v1/checkout/quote`.
