# Independent Review: TASK-065 — Implement Shared Customer Wishlist

## Review Metadata
- **Task ID**: `TASK-065`
- **Goal**: Build customer wishlist endpoints, database schema, Next.js interactive heart button, and account dashboard (`/account/wishlist`) with product availability indicators.
- **Risk Level**: LOW
- **Requirements Covered**: `REQ-ENG-001`, `design.md`
- **Date**: 2026-11-16
- **Status**: APPROVED

---

## 1. Scope & Artifacts Inspected

### Database Migration
- `db/migrations/0023-wishlists.sql`:
  - `wishlists` table: `user_id` (FK `users` ON DELETE CASCADE), `product_id` (FK `products` ON DELETE CASCADE), `created_at` (TIMESTAMPTZ).
  - Composite primary key `PRIMARY KEY (user_id, product_id)`.
  - Performance index `idx_wishlists_user_created` on `(user_id, created_at DESC)`.

### Contracts & API Schemas
- `packages/contracts/src/wishlist.ts`:
  - `wishlistItemDtoSchema`: Validates `productId`, `title`, `slug`, `description`, `priceCents`, `currency`, `imageUrl`, `available`, `status`, `storeName`, `storeSlug`, `primaryVariantId`, `addedAt`.
  - `wishlistResponseSchema`: Validates `items: Array<WishlistItemDto>`, `count: number`.
  - Exported through `packages/contracts/src/index.ts`.

### Domain Logic
- `packages/backend/src/engagement/errors.ts`:
  - `ProductNotFoundError` (404, `PRODUCT_NOT_FOUND`).
- `packages/backend/src/engagement/wishlist.service.ts`:
  - `addToWishlist`: Verifies target product exists in `products` table (throwing 404 if absent); inserts item with `ON CONFLICT (user_id, product_id) DO NOTHING` for idempotency.
  - `removeFromWishlist`: Deletes item scoped by authenticated user ID and product ID.
  - `isInWishlist`: Checks existence of row.
  - `getWishlist`: Selects saved items joining `products`, `stores`, primary variant, and primary media asset key; evaluates dynamic product availability (`product.status === 'active' && store.status === 'active'`). Resolves public CDN image URL via `storageService.getPublicUrl`.

### API Layer & Route Policy
- `apps/api/src/wishlist.controller.ts`:
  - `GET /v1/wishlist`: Returns customer's saved items (guarded by `SessionGuard`).
  - `PUT /v1/wishlist/:productId`: Idempotently adds product to wishlist.
  - `DELETE /v1/wishlist/:productId`: Removes product from wishlist.
  - Registered in `apps/api/src/app.module.ts`.
- `packages/backend/src/platform/route-policy.ts`: Classified all 3 wishlist endpoints with `kind: 'session'`.
- `docs/openapi.json`: Documented all 3 endpoints with OpenAPI 3.0 schemas.
- `apps/web/src/lib/api.ts`: Added `v1/wishlist` to `ALLOWED_GATEWAY_PATHS` and `ALLOWED_GATEWAY_PREFIXES`.

### Presentation & User Experience
- `apps/web/src/features/wishlist/wishlist-button.tsx`:
  - Interactive heart toggle button with optimistic updates and rollback on error.
  - Accessible `aria-label` and `aria-pressed`.
- `apps/web/src/features/catalog/product-detail.tsx`:
  - Integrated `WishlistHeartButton` directly alongside the PDP Add-to-Cart button.
- `apps/web/src/features/wishlist/wishlist-view.tsx`:
  - Responsive grid of saved product cards.
  - Displays thumbnail, title, formatted price, store name, and availability badge (`Tag tone="positive"` for "In Stock", `Tag tone="warning"` for "Unavailable").
  - "Add to cart" button adds item directly to cart via `CartContext` (disabled if item is unavailable).
  - "Remove" button removes item from wishlist.
  - Friendly empty state with CTA to explore products.
- `apps/web/src/app/account/wishlist/page.tsx`:
  - Server-rendered page protected by session authentication with redirect to login.
- `apps/web/src/app/account/page.tsx`:
  - Added "Saved Wishlist" navigation card.

---

## 2. Invariant & Security Verification

1. **User Ownership & Isolation**:
   - Every wishlist mutation and query is strictly scoped to `req.actor.userId`. Users cannot read or modify another customer's saved wishlist items.
2. **Archived / Unavailable Product Handling**:
   - If a seller archives a product or a store is suspended, the product remains visible on the customer's wishlist with an `Unavailable` badge rather than crashing or throwing an error, and the Add-to-Cart button is disabled.
3. **Idempotent Addition**:
   - Multiple clicks or concurrent additions are safely absorbed by `ON CONFLICT (user_id, product_id) DO NOTHING`.

---

## 3. Verification & Test Evidence

- **Unit Tests**:
  - `packages/backend/src/engagement/wishlist.service.test.ts`: 8 tests passing.
  - `apps/api/src/wishlist.controller.test.ts`: 9 tests passing.
  - `apps/web/src/features/wishlist/wishlist-button.test.tsx`: 4 tests passing.
  - `apps/web/src/features/wishlist/wishlist-view.test.tsx`: 3 tests passing.
- **Integration Tests**:
  - `packages/backend/tests/integration/wishlist.spec.ts`: Tests complete lifecycle (add, duplicate add, non-existent 404, user 1 vs user 2 isolation, archived product availability handling, removal).
  - `tests/integration/wishlist.spec.ts`: Re-exported root integration test.
- **Monorepo Health Check**:
  - `pnpm test`: 743 tests passing (100% pass across 7 workspace packages).
  - `pnpm typecheck`: Passed with 0 errors.
  - `pnpm lint`: Passed with 0 errors and 0 warnings.
  - `pnpm build`: Completed successfully (Next.js 16/16 pages generated, TypeScript compilation clean).

---

## 4. Conclusion & Approval

The customer wishlist implementation satisfies all product requirements, architectural rules, and acceptance criteria.
**Status**: APPROVED.
