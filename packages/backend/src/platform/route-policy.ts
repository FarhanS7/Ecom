// @shopscale/backend/platform/route-policy - Route access registry (T018).
// Every API route is classified exactly once: public, live-session, store
// membership, store permission, or platform admin. The matrix suite fails CI
// on any OpenAPI path missing here, so unclassified endpoints cannot ship
// silently. T074 expands this to all future routes; the mechanism is final.

export type RouteAccess =
  | { kind: 'public'; note?: string }
  | { kind: 'session'; note?: string }
  | { kind: 'storeMember'; note?: string }
  | { kind: 'store'; permission: string; note?: string }
  | { kind: 'platformAdmin'; note?: string };

export interface RoutePolicy {
  method: string;
  /** OpenAPI-style path ({param} segments). */
  path: string;
  access: RouteAccess;
  /** True for routes intentionally absent from the OpenAPI document. */
  undocumented?: boolean;
}

function keyOf(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export const ROUTE_POLICY: readonly RoutePolicy[] = [
  { method: 'GET', path: '/health/live', access: { kind: 'public' } },
  { method: 'GET', path: '/health/ready', access: { kind: 'public' } },
  { method: 'GET', path: '/metrics', access: { kind: 'public', note: 'Restricted by deployment, not by app auth.' }, undocumented: true },
  { method: 'GET', path: '/v1/ping', access: { kind: 'public' } },
  { method: 'POST', path: '/v1/auth/register', access: { kind: 'public', note: 'IP/email budgets + Origin check.' } },
  { method: 'POST', path: '/v1/auth/login', access: { kind: 'public', note: 'IP/email budgets + Origin check.' } },
  { method: 'POST', path: '/v1/auth/refresh', access: { kind: 'public', note: 'Refresh-cookie credential; IP/token budgets.' } },
  { method: 'POST', path: '/v1/auth/logout', access: { kind: 'session' } },
  { method: 'GET', path: '/v1/auth/me', access: { kind: 'session' } },
  { method: 'POST', path: '/v1/auth/password-reset/request', access: { kind: 'public', note: 'Generic outcomes; IP/email budgets.' } },
  { method: 'POST', path: '/v1/auth/password-reset/confirm', access: { kind: 'public', note: 'Generic outcomes.' } },
  { method: 'POST', path: '/v1/auth/verify-email/request', access: { kind: 'session' } },
  { method: 'POST', path: '/v1/auth/verify-email/confirm', access: { kind: 'public', note: 'Generic outcomes.' } },
  { method: 'GET', path: '/v1/stores/{slug}', access: { kind: 'public', note: 'Active stores only; rest 404.' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/membership', access: { kind: 'storeMember', note: 'Own active membership; generic 404 otherwise.' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/invitations', access: { kind: 'store', permission: 'team:manage' } },
  { method: 'PATCH', path: '/v1/seller/stores/{storeId}/members/{userId}', access: { kind: 'store', permission: 'team:manage', note: 'Last-owner guard inside.' } },
  { method: 'POST', path: '/v1/seller-applications', access: { kind: 'session', note: 'One business per account (demo rule).' } },
  { method: 'POST', path: '/v1/admin/stores/{storeId}/approve', access: { kind: 'platformAdmin' } },
  { method: 'POST', path: '/v1/admin/stores/{storeId}/suspend', access: { kind: 'platformAdmin' } },
  { method: 'POST', path: '/v1/invitations/accept', access: { kind: 'session', note: 'Email-matched, one-use.' } },
  { method: 'GET', path: '/v1/me/addresses', access: { kind: 'session', note: 'Owner-scoped list.' } },
  { method: 'POST', path: '/v1/me/addresses', access: { kind: 'session', note: 'Validated fields.' } },
  { method: 'GET', path: '/v1/me/addresses/{id}', access: { kind: 'session', note: 'Owner-scoped read; generic 404.' } },
  { method: 'PATCH', path: '/v1/me/addresses/{id}', access: { kind: 'session', note: 'Owner-scoped write; generic 404.' } },
  { method: 'DELETE', path: '/v1/me/addresses/{id}', access: { kind: 'session', note: 'Owner-scoped delete; snapshots (not FKs) for orders.' } },
  { method: 'GET', path: '/v1/catalog/marketplace/products', access: { kind: 'public', note: 'Visibility chain rechecked in SQL per read.' } },
  { method: 'GET', path: '/v1/catalog/marketplace/products/{productSlug}', access: { kind: 'public', note: 'Unpublished/draft/archived/suspended all share generic 404.' } },
  { method: 'GET', path: '/v1/catalog/stores/{slug}/products', access: { kind: 'public', note: 'Active store in active business only.' } },
  { method: 'GET', path: '/v1/catalog/stores/{slug}/products/{productSlug}', access: { kind: 'public', note: 'Store-channel publication flag required.' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/products', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/products', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/products/{productId}', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'PATCH', path: '/v1/seller/stores/{storeId}/products/{productId}', access: { kind: 'store', permission: 'catalog:manage', note: 'Optimistic version; stale → 409.' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/products/{productId}/archive', access: { kind: 'store', permission: 'catalog:manage', note: 'Archival preserves rows (RESTRICT).' } },
  { method: 'PATCH', path: '/v1/seller/stores/{storeId}/products/{productId}/publication', access: { kind: 'store', permission: 'catalog:manage', note: 'Independent channel flags.' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/products/{productId}/variants', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/products/{productId}/variants', access: { kind: 'store', permission: 'catalog:manage', note: 'Duplicate SKU → 409.' } },
  { method: 'PATCH', path: '/v1/seller/stores/{storeId}/products/{productId}/variants/{variantId}', access: { kind: 'store', permission: 'catalog:manage', note: 'Version gates on product counter.' } },
  { method: 'POST', path: '/v1/checkout/quote', access: { kind: 'public', note: 'Canonical quote calculation with 15-minute token TTL.' } },
  { method: 'POST', path: '/v1/checkout', access: { kind: 'session', note: 'Idempotent atomic checkout initiation with stock reservation.' } },
  { method: 'POST', path: '/v1/webhooks/payments', access: { kind: 'public', note: 'HMAC-signed mock payment provider webhook.' } },
  { method: 'GET', path: '/v1/orders', access: { kind: 'session', note: 'Customer order history' } },
  { method: 'GET', path: '/v1/orders/{id}', access: { kind: 'session', note: 'Customer order detail' } },
  { method: 'GET', path: '/v1/orders/{id}/invoice', access: { kind: 'session', note: 'Customer order invoice presigned download URL' } },
  { method: 'POST', path: '/v1/orders/{id}/cancel', access: { kind: 'session', note: 'Customer order cancellation' } },
  { method: 'POST', path: '/v1/orders/{id}/returns', access: { kind: 'session', note: 'Customer return request' } },
  { method: 'GET', path: '/v1/orders/{id}/returns', access: { kind: 'session', note: 'Customer return requests list' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/orders', access: { kind: 'store', permission: 'fulfillment:manage', note: 'Seller suborders' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/orders/{suborderId}', access: { kind: 'store', permission: 'fulfillment:manage', note: 'Seller suborder detail' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/orders/{suborderId}/transitions', access: { kind: 'store', permission: 'fulfillment:manage', note: 'Seller fulfillment transitions' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/returns', access: { kind: 'store', permission: 'fulfillment:manage', note: 'Seller return queue' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/returns/{returnId}/inspect', access: { kind: 'store', permission: 'fulfillment:manage', note: 'Seller return inspection decision' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/coupons', access: { kind: 'store', permission: 'catalog:manage', note: 'Seller store coupons list' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/coupons', access: { kind: 'store', permission: 'catalog:manage', note: 'Create seller store coupon' } },
  { method: 'POST', path: '/v1/coupons/validate', access: { kind: 'public', note: 'Validate and calculate coupon discount' } },
  { method: 'GET', path: '/v1/admin/coupons', access: { kind: 'platformAdmin', note: 'Platform marketplace coupons list' } },
  { method: 'POST', path: '/v1/admin/coupons', access: { kind: 'platformAdmin', note: 'Create platform marketplace coupon' } },
  { method: 'GET', path: '/v1/admin/audit-logs', access: { kind: 'platformAdmin', note: 'Platform admin audit log inspection' } },
  { method: 'GET', path: '/v1/catalog/products/{productId}/reviews', access: { kind: 'public', note: 'List product reviews and rating aggregates' } },
  { method: 'POST', path: '/v1/catalog/products/{productId}/reviews', access: { kind: 'session', note: 'Submit verified purchaser review' } },
  { method: 'GET', path: '/v1/wishlist', access: { kind: 'session', note: 'Customer saved wishlist items' } },
  { method: 'PUT', path: '/v1/wishlist/{productId}', access: { kind: 'session', note: 'Add product to customer wishlist' } },
  { method: 'DELETE', path: '/v1/wishlist/{productId}', access: { kind: 'session', note: 'Remove product from customer wishlist' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/analytics', access: { kind: 'store', permission: 'catalog:manage', note: 'Store sales metrics and trends' } },
  { method: 'GET', path: '/v1/admin/analytics', access: { kind: 'platformAdmin', note: 'Platform GMV and merchant leaderboard' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/team', access: { kind: 'store', permission: 'team:manage', note: 'Store team members and pending invitations' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/theme', access: { kind: 'store', permission: 'catalog:manage', note: 'Read store theme tokens' } },
  { method: 'PUT', path: '/v1/seller/stores/{storeId}/theme', access: { kind: 'store', permission: 'team:manage', note: 'Update store theme tokens' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/content', access: { kind: 'store', permission: 'catalog:manage', note: 'Read store homepage content' } },
  { method: 'PUT', path: '/v1/seller/stores/{storeId}/content', access: { kind: 'store', permission: 'team:manage', note: 'Update store homepage content' } },
  { method: 'GET', path: '/v1/admin/stores', access: { kind: 'platformAdmin', note: 'Platform admin store listing' } },
  { method: 'GET', path: '/v1/categories', access: { kind: 'public', note: 'Public category hierarchy' } },
  { method: 'POST', path: '/v1/admin/categories', access: { kind: 'platformAdmin', note: 'Create platform category' } },
  { method: 'PUT', path: '/v1/admin/categories/{id}/parent', access: { kind: 'platformAdmin', note: 'Reparent platform category' } },
  { method: 'DELETE', path: '/v1/admin/categories/{id}', access: { kind: 'platformAdmin', note: 'Delete platform category' } },
  { method: 'POST', path: '/v1/admin/orders/{orderId}/refund', access: { kind: 'session', note: 'Support/admin discretionary refund capped at $200 for support' } },
  { method: 'POST', path: '/v1/support/orders/{orderId}/refund', access: { kind: 'session', note: 'Support discretionary refund alias' } },
  { method: 'GET', path: '/v1/search', access: { kind: 'public', note: 'Public catalog search with filters and facets.' } },
  { method: 'GET', path: '/v1/search/suggest', access: { kind: 'public', note: 'Instant search autocomplete suggestions.' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/uploads', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/uploads/{assetId}/complete', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/products/{productId}/images', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/products/{productId}/images', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'DELETE', path: '/v1/seller/stores/{storeId}/products/{productId}/images/{imageId}', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'PUT', path: '/v1/seller/stores/{storeId}/products/{productId}/images/reorder', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/inventory', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/inventory/adjust', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/inventory/{variantId}/movements', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'GET', path: '/v1/carts/{channelKey}', access: { kind: 'public', note: 'Channel cart read (session or guest).' } },
  { method: 'DELETE', path: '/v1/carts/{channelKey}', access: { kind: 'public', note: 'Channel cart clear.' } },
  { method: 'POST', path: '/v1/carts/{channelKey}/items', access: { kind: 'public', note: 'Add item to cart.' } },
  { method: 'PATCH', path: '/v1/carts/{channelKey}/items/{variantId}', access: { kind: 'public', note: 'Update item quantity.' } },
  { method: 'DELETE', path: '/v1/carts/{channelKey}/items/{variantId}', access: { kind: 'public', note: 'Remove item from cart.' } },
  { method: 'POST', path: '/v1/carts/{channelKey}/merge', access: { kind: 'session', note: 'Guest cart login merge.' } },
  { method: 'POST', path: '/v1/test/concurrency-reserve', access: { kind: 'public', note: 'Test harness concurrency reserve.' } },
  { method: 'POST', path: '/v1/test/concurrency-seed', access: { kind: 'public', note: 'Test harness concurrency seed.' } },
  { method: 'GET', path: '/v1/test/concurrency-stats/{variantId}', access: { kind: 'public', note: 'Test harness concurrency stats.' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/orders/{suborderId}/transition', access: { kind: 'store', permission: 'fulfillment:manage' } },
  { method: 'GET', path: '/v1/admin/feature-flags', access: { kind: 'platformAdmin', note: 'List feature flags.' } },
  { method: 'GET', path: '/v1/admin/feature-flags/{key}', access: { kind: 'platformAdmin', note: 'Get feature flag.' } },
  { method: 'PUT', path: '/v1/admin/feature-flags/{key}', access: { kind: 'platformAdmin', note: 'Update feature flag.' } },
  { method: 'GET', path: '/v1/feature-flags/{key}/evaluate', access: { kind: 'public', note: 'Evaluate feature flag.' } },
];

/**
 * OpenAPI paths missing from the registry. Empty means every documented
 * route is classified — CI fails otherwise. `documented:false` registry
 * entries (metrics) are exempt by explicit reason, never by accident.
 */
export function findUnclassifiedRoutes(docPaths: Record<string, Record<string, unknown>>): string[] {
  const classified = new Set(ROUTE_POLICY.filter((r) => !r.undocumented).map((r) => keyOf(r.method, r.path)));
  const missing: string[] = [];
  for (const [path, operations] of Object.entries(docPaths)) {
    for (const method of Object.keys(operations)) {
      if (method === 'parameters') continue;
      const key = keyOf(method, path);
      if (!classified.has(key)) missing.push(key);
    }
  }
  return missing;
}

/** Registry entries that must exist in the OpenAPI document (drift check). */
export function findUndocumentedRoutes(docPaths: Record<string, Record<string, unknown>>): string[] {
  const missing: string[] = [];
  for (const route of ROUTE_POLICY) {
    if (route.undocumented) continue;
    const operations = docPaths[route.path];
    if (!operations || !(route.method.toLowerCase() in operations)) {
      missing.push(keyOf(route.method, route.path));
    }
  }
  return missing;
}
