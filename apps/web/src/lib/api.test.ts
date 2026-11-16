// T017a: gateway allowlist + cookie filtering without a server.

import { describe, expect, it } from 'vitest';
import { ALLOWED_GATEWAY_PATHS, filterSessionCookies, resolveGatewayTarget } from './api.js';

describe('gateway allowlist (T017a)', () => {
  it('proxies auth paths and still rejects everything else', () => {
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/auth/login');
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/auth/refresh');
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/search');
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/search/suggest');
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/checkout/quote');
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/checkout');
    expect(resolveGatewayTarget(['v1', 'auth', 'login'])).toEqual({ ok: true, path: 'v1/auth/login' });
    expect(resolveGatewayTarget(['v1', 'search', 'suggest'])).toEqual({ ok: true, path: 'v1/search/suggest' });
    expect(resolveGatewayTarget(['v1', 'checkout', 'quote'])).toEqual({ ok: true, path: 'v1/checkout/quote' });
    expect(resolveGatewayTarget(['v1', 'checkout'])).toEqual({ ok: true, path: 'v1/checkout' });
    expect(resolveGatewayTarget(['v1', 'admin', 'stores'])).toEqual({ ok: true, path: 'v1/admin/stores' });
    expect(resolveGatewayTarget(['v1', 'admin', 'unsupported-action'])).toEqual({ ok: false, reason: 'not allowlisted' });
    expect(resolveGatewayTarget(['https:', 'evil.example'])).toEqual({ ok: false, reason: 'illegal segment' });
  });

  it('proxies one-level per-ID children of prefix patterns (T091b)', () => {
    expect(resolveGatewayTarget(['v1', 'me', 'addresses', 'abc-123'])).toEqual({
      ok: true,
      path: 'v1/me/addresses/abc-123',
    });
    expect(resolveGatewayTarget(['v1', 'me', 'addresses', 'a', 'b'])).toEqual({
      ok: false,
      reason: 'not allowlisted',
    });
    expect(resolveGatewayTarget(['v1', 'me', 'addresses', '..'])).toEqual({ ok: false, reason: 'traversal' });
  });

  it('proxies the public catalog READS by exact template shape (T025a)', () => {
    expect(resolveGatewayTarget(['v1', 'catalog', 'marketplace', 'products'])).toEqual({
      ok: true,
      path: 'v1/catalog/marketplace/products',
    });
    expect(resolveGatewayTarget(['v1', 'catalog', 'stores', 't016-alpha', 'products'])).toEqual({
      ok: true,
      path: 'v1/catalog/stores/t016-alpha/products',
    });
    // Deeper, shallower, or sibling shapes stay out.
    expect(resolveGatewayTarget(['v1', 'catalog', 'marketplace', 'products', 'x'])).toEqual({
      ok: false,
      reason: 'not allowlisted',
    });
    expect(resolveGatewayTarget(['v1', 'catalog', 'stores', 't016-alpha'])).toEqual({
      ok: false,
      reason: 'not allowlisted',
    });
    expect(resolveGatewayTarget(['v1', 'catalog', 'admin', 'products'])).toEqual({
      ok: false,
      reason: 'not allowlisted',
    });
    // Writes are never proxied through the read templates.
    expect(resolveGatewayTarget(['v1', 'catalog', 'stores', 't016-alpha', 'products', 'p1'])).toEqual({
      ok: false,
      reason: 'not allowlisted',
    });
    expect(resolveGatewayTarget(['v1', 'catalog', 'stores', '..', 'products'])).toEqual({
      ok: false,
      reason: 'traversal',
    });
  });

  it('proxies cart routes by template shape (T043)', () => {
    expect(resolveGatewayTarget(['v1', 'carts', 'marketplace'])).toEqual({
      ok: true,
      path: 'v1/carts/marketplace',
    });
    expect(resolveGatewayTarget(['v1', 'carts', 'marketplace', 'items'])).toEqual({
      ok: true,
      path: 'v1/carts/marketplace/items',
    });
    expect(resolveGatewayTarget(['v1', 'carts', 'marketplace', 'items', 'var-123'])).toEqual({
      ok: true,
      path: 'v1/carts/marketplace/items/var-123',
    });
    expect(resolveGatewayTarget(['v1', 'carts', 'marketplace', 'merge'])).toEqual({
      ok: true,
      path: 'v1/carts/marketplace/merge',
    });
  });
});

describe('session cookie filtering (T017a)', () => {
  it('forwards exact session names and drops everything else', () => {
    expect(filterSessionCookies('access_token=a; refresh_token=b; cart_guest_token=guest-abc')).toBe(
      'access_token=a; refresh_token=b; cart_guest_token=guest-abc',
    );
    expect(filterSessionCookies('evil_access_token=x; access_token=a')).toBe('access_token=a');
    expect(filterSessionCookies('tracking=1; session=abc')).toBeNull();
    expect(filterSessionCookies(null)).toBeNull();
    expect(filterSessionCookies('access_token=')).toBeNull();
    expect(filterSessionCookies('nonsense')).toBeNull();
  });
});
