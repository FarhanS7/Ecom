# Independent Review: TASK-064 — Implement Verified Reviews and Rating Projection

## Review Metadata
- **Task ID**: `TASK-064`
- **Goal**: Implement review submission requiring verified purchaser status, `UNIQUE(product_id, user_id)` deduplication constraint, and asynchronous rating projection engine for products and search documents.
- **Risk Level**: MEDIUM
- **Requirements Covered**: `RV-1`, `RV-2`, PRD Section 6.6
- **Date**: 2026-11-16
- **Status**: APPROVED

---

## 1. Scope & Artifacts Inspected

### Database Migration
- `db/migrations/0022-reviews.sql`:
  - `reviews` table: `id` (UUID PK), `product_id` (FK `products`), `user_id` (FK `users`), `order_item_id` (FK `order_items`), `rating` (integer `CHECK (rating >= 1 AND rating <= 5)`), `body` (text), `status` (`published`, `hidden`, `flagged`), `created_at`, `updated_at`.
  - Unique constraint `uq_reviews_product_user` on `("product_id", "user_id")` guaranteeing exactly one review per user per product.
  - Performance indexes: `idx_reviews_product_created` on `(product_id, created_at DESC)` and `idx_reviews_user` on `(user_id)`.

### Contracts & API Schemas
- `packages/contracts/src/reviews.ts`:
  - `createReviewSchema`: Integer rating 1..5, trimmed body min 3 max 2000 characters.
  - `reviewDtoSchema`: Includes `id`, `productId`, `rating`, `body`, `authorName`, `isVerifiedPurchaser`, `createdAt`.
  - `listReviewsResponseSchema`: Includes `items`, `ratingAvg`, `ratingCount`, `nextCursor`.
  - Exported through `packages/contracts/src/index.ts`.

### Domain Logic & Rating Engine
- `packages/backend/src/engagement/errors.ts`:
  - `NotVerifiedPurchaserError` (403, `NOT_VERIFIED_PURCHASER`).
  - `ReviewAlreadyExistsError` (409, `REVIEW_ALREADY_EXISTS`).
  - `InvalidRatingError` (400, `INVALID_RATING`).
  - `ReviewNotFoundError` (404, `REVIEW_NOT_FOUND`).
- `packages/backend/src/engagement/review.service.ts`:
  - `createReview`:
    - Validates rating is integer between 1 and 5.
    - Prevents duplicate review per customer per product (`SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2`).
    - Verified purchaser verification: Checks that `order_items` joins with `product_variants` (`pv.product_id = $productId`), `orders` (`o.user_id = $actorId AND o.payment_status = 'PAID'`), and `seller_orders` (`so.fulfillment_status = 'DELIVERED'`). Rejects unpurchased or undelivered attempts with `NotVerifiedPurchaserError`.
    - Inserts review and transactionally emits `review.created` domain event to the `outbox` table.
  - `listReviewsForProduct`:
    - Retrieves published reviews with author display names (`COALESCE(u.name, split_part(u.email, '@', 1))`).
    - Queries denormalized aggregate ratings from `products` table.
  - `updateRatingRollup`:
    - Recomputes `rating_sum` and `rating_count` from published reviews.
    - Updates `products` table (`rating_sum`, `rating_count`, `updated_at`).
    - Updates denormalized `search_documents` table (`rating_avg`, `rating_count`).

### Worker Consumer & Projection
- `apps/worker/src/consumers/review-projector.consumer.ts`:
  - Consumes `review.created` / `ReviewChanged` outbox events.
  - Invocations are idempotent and safe on replay.
  - Recomputes ratings via `reviewService.updateRatingRollup(productId)`.
  - Invalidates PDP cache (`cache:pdp:${productId}*`) and search cache (`cache:search:*`).
- `apps/worker/src/consumers/domain-events.consumer.ts`:
  - Dispatches `review` aggregate events directly to `ReviewProjectorConsumer`.

### API Layer & Route Policy
- `apps/api/src/reviews.controller.ts`:
  - `GET /v1/catalog/products/:productId/reviews`: Public endpoint returning reviews list and aggregate rating stats.
  - `POST /v1/catalog/products/:productId/reviews`: Guarded by `SessionGuard`, validates body via `createReviewSchema`, maps domain errors to standard HTTP status codes (403 Forbidden, 409 Conflict, 400 Bad Request).
  - Registered in `apps/api/src/app.module.ts`.
- `packages/backend/src/platform/route-policy.ts`: Classified `GET` as public and `POST` as live-session.
- `docs/openapi.json`: Documented both routes with OpenAPI schemas.
- `apps/web/src/lib/api.ts`: Added `v1/catalog/products/{id}/reviews` to `ALLOWED_GATEWAY_TEMPLATES`.

### Presentation & User Experience
- `apps/web/src/features/catalog/product-reviews.tsx`:
  - Star rating selector with hover preview and accessible button controls.
  - Review text area with validation feedback.
  - Displays aggregate star rating, average number, and review count.
  - Displays reviews list with author name, date, star count, review text, and green `Verified Purchaser` badge (`Tag tone="positive"`).
  - Clear user alerts for 401 Unauthorized, 403 Not Verified Purchaser, and 409 Duplicate Review.
- `apps/web/src/features/catalog/product-detail.tsx`:
  - Integrated `ProductReviews` section on PDP.
- `apps/web/src/styles/components.css`:
  - Added dedicated BEM classes for review cards, star pickers, badges, and review items.

---

## 2. Invariant & Security Verification

1. **Purchaser Eligibility Check**:
   - Strictly enforced via SQL join against `orders.payment_status = 'PAID'` AND `seller_orders.fulfillment_status = 'DELIVERED'`. Customers who placed an order that was cancelled, refunded, or is still in processing cannot review.
2. **Review Deduplication**:
   - Double-enforced via pre-insert select and database-level `UNIQUE(product_id, user_id)` constraint.
3. **Rating Integrity**:
   - Verified integers 1 to 5 enforced at Zod schema layer, service layer, and SQL `CHECK` constraint.
4. **Denormalized Search Projection**:
   - Products and search documents denormalize average rating and count to support fast sorting and filtering in catalog search without expensive runtime joins.

---

## 3. Verification & Test Evidence

- **Unit Tests**:
  - `packages/backend/src/engagement/review.service.test.ts`: 7 tests passing.
  - `apps/api/src/reviews.controller.test.ts`: 9 tests passing.
  - `apps/worker/src/consumers/review-projector.consumer.test.ts`: 3 tests passing.
  - `apps/web/src/features/catalog/product-reviews.test.tsx`: 5 tests passing.
  - `apps/web/src/features/catalog/product-detail.test.tsx`: 9 tests passing.
- **Integration Tests**:
  - `packages/backend/tests/integration/reviews.spec.ts`: Tests complete lifecycle (unverified 403, undelivered 403, delivered review submission, 409 duplicate rejection, outbox emission, rating projection to products and search_documents).
  - `tests/integration/reviews.spec.ts`: Re-exported root integration test.
- **Monorepo Health Check**:
  - `pnpm test`: 719 tests passing across all 7 workspace packages (0 failures).
  - `pnpm typecheck`: Passed with 0 errors.
  - `pnpm lint`: Passed with 0 errors and 0 warnings.
  - `pnpm build`: Completed successfully (Next.js 28 routes generated, all packages compiled).

---

## 4. Conclusion & Approval

The verified purchaser reviews and rating projection engine conforms to the PRD, architecture specifications, and Definition of Done.
**Status**: APPROVED.
