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
  { method: 'GET', path: '/v1/seller/stores/{storeId}/products', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/products', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/products/{productId}', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'PATCH', path: '/v1/seller/stores/{storeId}/products/{productId}', access: { kind: 'store', permission: 'catalog:manage', note: 'Optimistic version; stale → 409.' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/products/{productId}/archive', access: { kind: 'store', permission: 'catalog:manage', note: 'Archival preserves rows (RESTRICT).' } },
  { method: 'PATCH', path: '/v1/seller/stores/{storeId}/products/{productId}/publication', access: { kind: 'store', permission: 'catalog:manage', note: 'Independent channel flags.' } },
  { method: 'GET', path: '/v1/seller/stores/{storeId}/products/{productId}/variants', access: { kind: 'store', permission: 'catalog:manage' } },
  { method: 'POST', path: '/v1/seller/stores/{storeId}/products/{productId}/variants', access: { kind: 'store', permission: 'catalog:manage', note: 'Duplicate SKU → 409.' } },
  { method: 'PATCH', path: '/v1/seller/stores/{storeId}/products/{productId}/variants/{variantId}', access: { kind: 'store', permission: 'catalog:manage', note: 'Version gates on product counter.' } },
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
