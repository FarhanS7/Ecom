// T027b: seller server actions. These are the console's only door to the write
// API, so the tests cover the three things that must never be bypassable:
// server-side validation, id validation, and the conflict/re-read flow.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The actions import the server-only loader, which memoizes with React's
// request-scoped `cache`; vitest resolves the client build where it does not
// exist. Identity is how `cache` behaves outside a request (see load.test.ts).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: (fn: unknown) => fn };
});

vi.mock('next/headers', () => ({
  cookies: () => ({ toString: () => 'access_token=session-cookie' }),
}));

import {
  archiveProduct,
  saveProduct,
  savePublication,
  saveVariant,
  setProductStatus,
} from '@/features/seller/actions';
import type { ProductFormValues, VariantFormValues } from '@/features/seller/validation';

const API_ORIGIN = 'http://api.test';
const STORE = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const VARIANT = '33333333-3333-4333-8333-333333333333';

const PRODUCT_VALUES: ProductFormValues = {
  slug: 'desk-lamp',
  title: 'Desk Lamp',
  description: 'A lamp.',
  brand: '',
  attributes: 'color = Black',
};

const VARIANT_VALUES: VariantFormValues = {
  sku: 'LAMP-BLK',
  price: '12.99',
  attributes: 'color = Black',
  status: 'active',
};

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
    attributes: { color: 'Black' },
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

function call(index: number): { url: string; init: RequestInit } {
  const entry = fetchMock.mock.calls[index];
  return { url: String(entry?.[0] ?? ''), init: (entry?.[1] ?? {}) as RequestInit };
}

function bodyOf(index: number): Record<string, unknown> {
  return JSON.parse(String(call(index).init.body ?? '{}')) as Record<string, unknown>;
}

describe('saveProduct (T027b)', () => {
  it('validates on the server and creates through the seller route', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productBody(), 201));
    const state = await saveProduct({
      storeId: STORE,
      productId: null,
      expectedVersion: null,
      values: PRODUCT_VALUES,
    });

    expect(state.status).toBe('saved');
    expect(call(0).url).toBe(`${API_ORIGIN}/v1/seller/stores/${STORE}/products`);
    expect(call(0).init.method).toBe('POST');
    expect(bodyOf(0)).toMatchObject({
      slug: 'desk-lamp',
      title: 'Desk Lamp',
      brand: null,
      attributes: { color: 'Black' },
      currency: 'usd',
      categoryId: null,
    });
  });

  it('returns field errors without touching the API', async () => {
    const state = await saveProduct({
      storeId: STORE,
      productId: null,
      expectedVersion: null,
      values: { ...PRODUCT_VALUES, title: '' },
    });
    expect(state).toEqual({ status: 'invalid', errors: { title: 'Title is required.' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a bad store id without a request', async () => {
    const state = await saveProduct({
      storeId: '../admin',
      productId: null,
      expectedVersion: null,
      values: PRODUCT_VALUES,
    });
    expect(state).toEqual({ status: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a version when editing', async () => {
    const state = await saveProduct({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: null,
      values: PRODUCT_VALUES,
    });
    expect(state).toEqual({ status: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the patch for an edit and reports the saved product', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productBody({ version: 2 })));
    const state = await saveProduct({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: 1,
      values: PRODUCT_VALUES,
    });
    expect(state.status).toBe('saved');
    expect(call(0).init.method).toBe('PATCH');
    expect(bodyOf(0)['expectedVersion']).toBe(1);
    expect(bodyOf(0)).not.toHaveProperty('slug');
  });

  it('turns a stale version into a conflict with the current product', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Product was modified by another writer.' }, 409))
      .mockResolvedValueOnce(jsonResponse(productBody({ version: 4, title: 'Someone Else' })));

    const state = await saveProduct({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: 2,
      values: PRODUCT_VALUES,
    });

    expect(state.status).toBe('conflict');
    if (state.status === 'conflict') {
      expect(state.message).toBe('Product was modified by another writer.');
      // "Reload latest" / "apply my changes" need the real current version.
      expect(state.current?.version).toBe(4);
      expect(state.current?.title).toBe('Someone Else');
    }
    expect(call(1).url).toBe(`${API_ORIGIN}/v1/seller/stores/${STORE}/products/${PRODUCT}`);
    expect(call(1).init.method).toBe('GET');
  });

  it('reports a conflict honestly even when the re-read fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ title: 'Conflict' }, 409))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const state = await saveProduct({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: 2,
      values: PRODUCT_VALUES,
    });
    expect(state.status).toBe('conflict');
    if (state.status === 'conflict') expect(state.current).toBeNull();
  });

  it('maps a duplicate slug on create to unavailable, with no re-read', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Slug already exists in this store.' }, 409));
    const state = await saveProduct({
      storeId: STORE,
      productId: null,
      expectedVersion: null,
      values: PRODUCT_VALUES,
    });
    // Nothing to reload for a product that does not exist yet.
    expect(state).toEqual({ status: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('separates not-found, signed-out and unavailable', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    expect(
      (
        await saveProduct({
          storeId: STORE,
          productId: null,
          expectedVersion: null,
          values: PRODUCT_VALUES,
        })
      ).status,
    ).toBe('not-found');

    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    expect(
      (
        await saveProduct({
          storeId: STORE,
          productId: null,
          expectedVersion: null,
          values: PRODUCT_VALUES,
        })
      ).status,
    ).toBe('unauthenticated');

    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));
    expect(
      (
        await saveProduct({
          storeId: STORE,
          productId: null,
          expectedVersion: null,
          values: PRODUCT_VALUES,
        })
      ).status,
    ).toBe('unavailable');
  });
});

describe('variant and lifecycle actions (T027b)', () => {
  it('creates a variant and returns the re-read product version', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: VARIANT,
            productId: PRODUCT,
            sku: 'LAMP-BLK',
            priceCents: 1299,
            attributes: { color: 'Black' },
            status: 'active',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(productBody({ version: 2, minPriceCents: 1299 })));

    const state = await saveVariant({
      storeId: STORE,
      productId: PRODUCT,
      variantId: null,
      expectedVersion: 1,
      values: VARIANT_VALUES,
    });

    expect(state.status).toBe('saved');
    if (state.status === 'saved') {
      expect(state.variant.priceCents).toBe(1299);
      expect(state.product?.version).toBe(2);
    }
    expect(call(0).url).toBe(`${API_ORIGIN}/v1/seller/stores/${STORE}/products/${PRODUCT}/variants`);
    expect(bodyOf(0)['priceCents']).toBe(1299);
    expect(call(1).init.method).toBe('GET');
  });

  it('keeps a successful write successful when only the version refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { id: VARIANT, productId: PRODUCT, sku: 'X', priceCents: 100, attributes: {}, status: 'active' },
          201,
        ),
      )
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const state = await saveVariant({
      storeId: STORE,
      productId: PRODUCT,
      variantId: null,
      expectedVersion: 1,
      values: VARIANT_VALUES,
    });
    expect(state.status).toBe('saved');
    if (state.status === 'saved') expect(state.product).toBeNull();
  });

  it('refuses an edit with no variant id', async () => {
    const state = await saveVariant({
      storeId: STORE,
      productId: PRODUCT,
      variantId: '../x',
      expectedVersion: 1,
      values: VARIANT_VALUES,
    });
    expect(state).toEqual({ status: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('toggles one channel at a time', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productBody({ storeEnabled: true, version: 3 })));
    const state = await savePublication({ storeId: STORE, productId: PRODUCT, storeEnabled: true });
    expect(state.status).toBe('saved');
    expect(call(0).url).toBe(`${API_ORIGIN}/v1/seller/stores/${STORE}/products/${PRODUCT}/publication`);
    expect(bodyOf(0)).toEqual({ storeEnabled: true });
  });

  it('publishes through the versioned patch', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productBody({ status: 'active', version: 3 })));
    const state = await setProductStatus({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: 2,
      status: 'active',
    });
    expect(state.status).toBe('saved');
    expect(bodyOf(0)).toEqual({ expectedVersion: 2, status: 'active' });
  });

  it('surfaces a refused publish (no active variant) as a conflict with its reason', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'Add an active variant before publishing this product.' }, 409),
      )
      .mockResolvedValueOnce(jsonResponse(productBody({ version: 2 })));

    const state = await setProductStatus({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: 2,
      status: 'active',
    });
    expect(state.status).toBe('conflict');
    if (state.status === 'conflict') {
      expect(state.message).toBe('Add an active variant before publishing this product.');
    }
  });

  it('archives with the expected version', async () => {
    fetchMock.mockResolvedValue(jsonResponse(productBody({ status: 'archived', version: 5 })));
    const state = await archiveProduct({ storeId: STORE, productId: PRODUCT, expectedVersion: 4 });
    expect(state.status).toBe('saved');
    expect(call(0).url).toBe(`${API_ORIGIN}/v1/seller/stores/${STORE}/products/${PRODUCT}/archive`);
    expect(bodyOf(0)).toEqual({ expectedVersion: 4 });
  });
});
