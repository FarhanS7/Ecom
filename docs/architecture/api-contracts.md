# API contracts

Status: proposed REST contract; business endpoints implement under /v1. Health and metrics remain unversioned at /health/live, /health/ready and /metrics. Browser pages have their own routes. Generate and validate OpenAPI 3.1 during implementation; validate actual generator output rather than assuming a version string is enough.

## Common behavior

- JSON identifiers are UUID strings. Money is decimal strings in cents; currency is a 3-letter uppercase code. Timestamps are ISO-8601 UTC.
- Mutations validate unknown fields, lengths, enum values, maximum quantities, and actor permissions. Do not serialize ORM entities directly.
- Error body: {type,title,status,detail,instance,code,requestId}. No stack traces or secret fields.
- List response: {items,nextCursor}; default limit 20, maximum 100. Cursor encodes sort tuple, filter hash, channel, and schema version. Reject tampered/mismatched cursors with 400 INVALID_CURSOR.
- 401 unauthenticated; 403 missing general permission; 404 missing/out-of-scope resource; 409 stale version, exhausted stock, or key conflict; 422 validation; 429 rate limit with Retry-After.
- Requests carry X-Request-Id (validated or server-generated). Trace context is forwarded through trusted services.
- Store routes resolve slug/ID to an approved active store; publication checks happen server-side. A seller body cannot select another store.
- ETag/If-Match or body version for concurrent catalog/cart edits. Stale writes return 409 with a recoverable UI path.

## Endpoint families

| Module | Endpoints | Access / response |
| --- | --- | --- |
| identity | POST /auth/register, /auth/login, /auth/refresh, /auth/logout | Same-origin cookie session; login/register input validated |
| identity | POST /auth/password-reset/request, /auth/password-reset/confirm, /auth/verify-email | Generic request response; one-use expiring proof |
| identity | GET /me, GET /me/sessions, DELETE /me/sessions/{id} | Current user only |
| identity | GET /auth/csrf | Same-origin browser proof bootstrap; explicitly public |
| identity | GET/POST /me/addresses; PATCH/DELETE /me/addresses/{id} | Current user's address book only |
| stores | POST /seller-applications; POST /admin/stores/{id}/approve or /suspend | User application; platform admin decisions |
| stores | GET /stores/{slug}; PATCH /seller/stores/{id}/theme, /content | Public safe config; scoped staff mutation |
| stores | POST /seller/stores/{id}/invitations; POST /invitations/accept; PATCH /seller/stores/{id}/members/{userId} | Owner/manager according to permission matrix |
| catalog | GET /products; GET /products/{id}; GET /stores/{slug}/products; GET /stores/{slug}/products/{productSlug} | Public channel-filtered records |
| catalog | GET /categories; POST/PATCH /admin/categories | Public category tree; platform-admin edits with cycle prevention |
| catalog | POST /seller/stores/{id}/products; PATCH /seller/stores/{id}/products/{productId} | Catalog permission and ownership |
| media | POST /seller/stores/{id}/uploads; POST /seller/stores/{id}/uploads/{assetId}/complete | Scoped short-lived upload grant; verify object before publication |
| search | GET /search; GET /search/suggest | q, channel, store slug, filter values, sort, cursor; filter/facet policy in search spec |
| cart | GET /carts/{channelKey}; POST /carts/{channelKey}/items; PATCH/DELETE /carts/{channelKey}/items/{variantId} | Authenticated owner or signed guest-cart handle |
| cart | POST /carts/{channelKey}/merge | Authenticated user + guest proof; same channel only |
| commerce | POST /checkout | Auth required, Idempotency-Key required; body below |
| commerce | POST /checkout/quote | Authenticated canonical price quote; no stock/coupon reservation |
| commerce | GET /orders; GET /orders/{id}; POST /orders/{id}/cancel | Customer owns order; history can filter channel/store |
| payments | POST /webhooks/payments | Raw body signature + timestamp tolerance; event dedupe |
| commerce | GET /seller/stores/{id}/orders; POST /seller/stores/{id}/orders/{suborderId}/transitions | Scoped order lines and allowed transition |
| returns | POST /orders/{id}/returns; PATCH /seller/stores/{id}/returns/{returnId} | Purchase owner requests; staff decides within policy |
| refunds | POST /orders/{id}/refund-requests; POST /support/refunds; POST /admin/refunds | Seller request/customer return; authorized approval with cumulative caps |
| promotions | POST/PATCH /seller/stores/{id}/coupons; POST /admin/coupons | Store or platform coupon; validated scope |
| reviews | POST /products/{id}/reviews; PATCH /reviews/{id}; GET /products/{id}/reviews | Verified purchase to create; own review to edit |
| wishlist | GET /wishlist; PUT/DELETE /wishlist/{productId} | Current customer only |
| reporting | GET /seller/stores/{id}/reports; GET /admin/reports; GET /admin/audit-logs | Scope-aware aggregates/audit; freshness shown |
| operations | GET /health/live, /health/ready, /metrics | Health exposes no secrets; metrics restricted by deployment |

## Checkout request and response

```typescript
type CheckoutInput = {
  channelKey: 'marketplace' | string; // validated store UUID otherwise
  cartVersion: number;
  addressId: string;
  couponCode?: string;
  acceptedQuoteToken: string; // signed server quote previously reviewed by customer
};
type CheckoutAccepted = {
  orderId: string;
  status: 'PENDING';
  totalCents: string;
  currency: 'USD';
  expiresAt: string;
};
```

POST /checkout/quote accepts the checkout fields except acceptedQuoteToken. It returns canonical line/suborder totals, shipping, discount, currency, an expiresAt value (proposed five minutes), and a signed opaque quote token bound to actor, channel, cart version, address, coupon and totals. A quote does not reserve stock or consume a coupon. It never trusts client prices.

Server loads durable cart, ownership, address, current variants, channel visibility, prices, discounts, and stock. Verify the quote signature, binding and expiry, then recompute totals. Reject expired quotes with 409 QUOTE_EXPIRED and changed totals with 409 PRICE_CHANGED before any reservation or charge; return a refresh-quote path. Never accept unit prices or user_id. Return 202 with order status URL after durable reservation. Payment completion is asynchronous, so a successful HTTP checkout response is not a claim that payment succeeded.

Check an existing idempotency record before revalidating a quote's current expiry: an accepted checkout must replay its stored response even after the original quote expires. Bind the original quote token to the request hash. A newly confirmed replacement quote is a new intended operation, not permission to change an already-successful checkout under the old key.

Persist exact response/status against the idempotency record. Same user/operation/channel/key with same normalized request hash returns the original result. Changed payload returns 409 IDEMPOTENCY_CONFLICT. A concurrent in-progress call either waits briefly for the original commit or returns 409 REQUEST_IN_PROGRESS with Retry-After. A retry must not reserve again.

Example: two units at 2500 cents plus one seller shipping at 500 cents produce totalCents "5500". Changing client-rendered price to "1" cannot change that result.

## Contract testing

Check generated clients against schemas, exercise every route/role, compare store and marketplace visibility, and prove errors do not reveal other stores' existence. Add compatibility tests before event/API breaking changes; version endpoints only when semantics truly change.
