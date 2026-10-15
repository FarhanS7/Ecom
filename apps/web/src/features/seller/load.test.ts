// T027b: the seller console's server-only data access. The console may only
// ever report what the API actually said: a scoped 404 is one answer
// regardless of whether the store exists, a 401 means signed out, and anything
// else (outage, contract drift) is unavailable — never "not yours".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// See features/catalog/load.test.ts: vitest resolves the CLIENT React build,
// where `cache` does not exist outside a request. Identity is exactly how
// `cache` behaves outside a request scope.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: (fn: unknown) => fn };
});

vi.mock('next/headers', () => ({
  cookies: () => ({ toString: () => 'access_token=session-cookie' }),
}));

import {
  isSellerId,
  loadMembership,
  loadSellerProduct,
  loadSellerProducts,
  loadVariants,
  sellerArchivePath,
  sellerMembershipPath,
  sellerProductPath,
  sellerProductsPath,
  sellerPublicationPath,
  sellerVariantPath,
} from '@/features/seller/load';

const API_ORIGIN = 'http://api.test';
const STORE = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const VARIANT = '33333333-3333-4333-8333-333333333333';

function productBody(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT,
    storeId: STORE,
    categoryId: null,
    slug: 'desk-lamp',
    title: 'Desk Lamp',
    description: 'A lamp.',
    brand: null,
    status: 'draft',
    attributes: {},
    minPriceCents: 0,
    currency: 'usd',
    version: 1,
    marketplaceEnabled: false,
    storeEnabled: false,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env['API_BASE_URL'] = API_ORIGIN;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['API_BASE_URL'];
});

function lastRequest(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(call?.[0] ?? ''), init: (call?.[1] ?? {}) as RequestInit };
}

describe('seller paths (T027b)', () => {
  it('builds the documented seller routes', () => {
    expect(sellerMembershipPath(STORE)).toBe(`/v1/seller/stores/${STORE}/membership`);
    expect(sellerProductsPath(STORE)).toBe(`/v1/seller/stores/${STORE}/products`);
    expect(sellerProductPath(STORE, PRODUCT)).toBe(`/v1/seller/stores/${STORE}/products/${PRODUCT}`);
    expect(sellerPublicationPath(STORE, PRODUCT)).toBe(
      `/v1/seller/stores/${STORE}/products/${PRODUCT}/publication`,
    );
    expect(sellerArchivePath(STORE, PRODUCT)).toBe(
      `/v1/seller/stores/${STORE}/products/${PRODUCT}/archive`,
    );
    expect(sellerVariantPath(STORE, PRODUCT, VARIANT)).toBe(
      `/v1/seller/stores/${STORE}/products/${PRODUCT}/variants/${VARIANT}`,
    );
  });

  it('refuses a non-uuid id instead of building a traversable path', () => {
    expect(isSellerId('..')).toBe(false);
    expect(() => sellerProductPath(STORE, '../admin')).toThrow();
    expect(() => sellerProductsPath('not-a-uuid')).toThrow();
  });
});

describe('seller reads (T027b)', () => {
  it('forwards the session cookie and never caches', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productBody()));
    const result = await loadSellerProduct(STORE, PRODUCT);

    const { url, init } = lastRequest();
    expect(url).toBe(`${API_ORIGIN}/v1/seller/stores/${STORE}/products/${PRODUCT}`);
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>)['cookie']).toBe('access_token=session-cookie');
    expect(result.status).toBe('ok');
  });

  it('reads membership, the product list and variants', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ storeId: STORE, role: 'owner', status: 'active' }));
    expect(await loadMembership(STORE)).toEqual({
      status: 'ok',
      data: { storeId: STORE, role: 'owner', status: 'active' },
    });

    fetchMock.mockResolvedValue(jsonResponse({ items: [productBody()] }));
    const list = await loadSellerProducts(STORE);
    expect(list.status).toBe('ok');
    if (list.status === 'ok') expect(list.data).toHaveLength(1);

    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: VARIANT,
            productId: PRODUCT,
            sku: 'LAMP-BLK',
            priceCents: 1299,
            attributes: {},
            status: 'active',
          },
        ],
      }),
    );
    const variants = await loadVariants(STORE, PRODUCT);
    expect(variants.status).toBe('ok');
    if (variants.status === 'ok') expect(variants.data[0]?.sku).toBe('LAMP-BLK');
  });

  it('maps a scoped 404 to one generic not-found', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    expect(await loadSellerProduct(STORE, PRODUCT)).toEqual({ status: 'not-found' });
    expect(await loadMembership(STORE)).toEqual({ status: 'not-found' });
    expect(await loadSellerProducts(STORE)).toEqual({ status: 'not-found' });
    expect(await loadVariants(STORE, PRODUCT)).toEqual({ status: 'not-found' });
  });

  it('separates signed-out from unavailable', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await loadSellerProducts(STORE)).toEqual({ status: 'unauthenticated' });

    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));
    expect(await loadSellerProducts(STORE)).toEqual({ status: 'unavailable' });

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await loadSellerProducts(STORE)).toEqual({ status: 'unavailable' });
  });

  it('treats an unvalidatable body as unavailable, never as an empty console', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ slug: 'desk-lamp' }] }));
    expect(await loadSellerProducts(STORE)).toEqual({ status: 'unavailable' });
  });

  it('flattens a write-only 409 on a read', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Version conflict.' }, 409));
    expect(await loadSellerProduct(STORE, PRODUCT)).toEqual({ status: 'unavailable' });
  });

  it('refuses a bad id without making a request', async () => {
    expect(await loadSellerProduct(STORE, '../../etc/passwd')).toEqual({ status: 'not-found' });
    expect(await loadMembership('nope')).toEqual({ status: 'not-found' });
    expect(await loadVariants(STORE, 'nope')).toEqual({ status: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an unconfigured API as unavailable instead of crashing', async () => {
    delete process.env['API_BASE_URL'];
    expect(await loadSellerProducts(STORE)).toEqual({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
