// T026a: the server-only product loader. Every path must end in exactly one of
// ok / not-found / unavailable, and the request must stay channel-scoped.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vitest resolves the CLIENT React build here, which has no `cache` export;
// Next's server runtime supplies it (and inside a request `cache` is what
// memoizes the loader). Identity is exactly how `cache` behaves outside a
// request scope, so the behavior under test is unchanged.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: (fn: unknown) => fn };
});

import { loadProductDetail, productBasePath } from '@/features/catalog/load';

const ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';

const API_ORIGIN = 'http://api.test';

function detailBody(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    slug: 'x-bud',
    title: 'X Bud',
    brand: null,
    priceCents: 12900,
    currency: 'USD',
    ratingCount: 12,
    description: 'Noise cancelling earbuds.',
    attributes: { color: 'Black' },
    status: 'published',
    store: { slug: 'alpha', name: 'Alpha' },
    variants: [
      { id: VARIANT_ID, sku: 'X-BLK', priceCents: 12900, attributes: { color: 'Black' } },
    ],
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

function requestedUrl(call = 0): string {
  return String(fetchMock.mock.calls[call]?.[0] ?? '');
}

describe('channel-scoped detail reads (T026a)', () => {
  it('reads the marketplace endpoint and keeps the response uncached', async () => {
    fetchMock.mockResolvedValue(jsonResponse(detailBody()));
    const result = await loadProductDetail(null, 'x-bud');

    expect(requestedUrl()).toBe(`${API_ORIGIN}/v1/catalog/marketplace/products/x-bud`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.product.slug).toBe('x-bud');
      expect(result.product.variants).toHaveLength(1);
    }
  });

  it('reads the store endpoint for a store channel', async () => {
    fetchMock.mockResolvedValue(jsonResponse(detailBody()));
    await loadProductDetail('t016-alpha', 'x-bud');
    expect(requestedUrl()).toBe(
      `${API_ORIGIN}/v1/catalog/stores/t016-alpha/products/x-bud`,
    );
  });

  it('never resolves two stores to the same request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(detailBody()));
    await loadProductDetail('alpha', 'x-bud');
    await loadProductDetail('beta', 'x-bud');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestedUrl(0)).toContain('/stores/alpha/');
    expect(requestedUrl(1)).toContain('/stores/beta/');
    expect(requestedUrl(0)).not.toBe(requestedUrl(1));
  });

  it('mirrors the channel in the link base path', () => {
    expect(productBasePath(null)).toBe('/products');
    expect(productBasePath('alpha')).toBe('/stores/alpha/products');
  });
});

describe('the three outcomes (T026a)', () => {
  it('maps a definite 404 to not-found', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    expect(await loadProductDetail(null, 'x-bud')).toEqual({ status: 'not-found' });
  });

  it('maps an error status to unavailable, never to not-found', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));
    expect(await loadProductDetail(null, 'x-bud')).toEqual({ status: 'unavailable' });
  });

  it('maps a transport failure to unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await loadProductDetail(null, 'x-bud')).toEqual({ status: 'unavailable' });
  });

  it('maps a body that fails the contract to unavailable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ slug: 'x-bud', title: 'X Bud' }));
    expect(await loadProductDetail(null, 'x-bud')).toEqual({ status: 'unavailable' });
  });

  it('maps an unconfigured API origin to unavailable instead of crashing', async () => {
    delete process.env['API_BASE_URL'];
    expect(await loadProductDetail(null, 'x-bud')).toEqual({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a slug the API would reject without making a request', async () => {
    expect(await loadProductDetail(null, '../etc/passwd')).toEqual({ status: 'not-found' });
    expect(await loadProductDetail('alpha', '')).toEqual({ status: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
