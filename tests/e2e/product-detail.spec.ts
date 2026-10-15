// T026b product-detail spec — bench host with the full local stack. Browsers
// must be installed first; this file is NOT run where browsers are absent. The
// presentation/selection rules are also proven in jsdom
// (src/features/catalog/product-detail.test.tsx, variants.test.ts) and the
// loader's outcomes in load.test.ts.
//
// Two things only a browser can establish, and both are here:
//   1. the PDP is SERVER-rendered (a JS-disabled context still shows the title,
//      price and the deep-linked variant), unlike the listing island;
//   2. native keyboard variant selection moves the choice and updates the price.
//
// Expected values are read from the API, never copied out of the component, so
// the spec cannot agree with a bug in the formatter. The "catalog unreachable"
// state cannot be induced from the browser (the fetch happens server-side), so
// it is covered by the jsdom suite and the SSR check recorded in
// docs/reviews/t026-context.md.

import { expect, test } from '@playwright/test';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const SEEDED_STORES = ['t016-alpha', 't016-beta'];

interface Variant {
  id: string;
  sku: string;
  priceCents: number;
  attributes: Record<string, unknown>;
}

interface Detail {
  slug: string;
  title: string;
  priceCents: number;
  currency: string;
  store: { slug: string; name: string };
  variants: Variant[];
}

async function getJson<T>(request: APIRequestContext, path: string): Promise<T | null> {
  const response: APIResponse = await request.get(`${API_BASE}${path}`);
  if (!response.ok()) return null;
  return (await response.json()) as T;
}

async function firstProduct(
  request: APIRequestContext,
  channelPath: string,
): Promise<{ slug: string; title: string } | null> {
  const body = await getJson<{ items: Array<{ slug: string; title: string }> }>(
    request,
    `${channelPath}?limit=1`,
  );
  return body?.items?.[0] ?? null;
}

async function detailOf(
  request: APIRequestContext,
  channelPath: string,
  slug: string,
): Promise<Detail | null> {
  return getJson<Detail>(request, `${channelPath}/${slug}`);
}

async function priceText(page: Page): Promise<string> {
  return (await page.getByTestId('pdp-price').textContent())?.trim() ?? '';
}

test.describe('server-rendered product detail', () => {
  // No JavaScript: whatever is visible came from the server HTML.
  test.use({ javaScriptEnabled: false });

  test('shows the catalog content and honours a deep-linked variant without JS', async ({
    page,
    request,
  }) => {
    const listed = await firstProduct(request, '/v1/catalog/marketplace/products');
    test.skip(listed === null, 'no published marketplace product seeded yet (T028)');
    const detail = await detailOf(
      request,
      '/v1/catalog/marketplace/products',
      listed?.slug ?? '',
    );
    test.skip(detail === null, 'marketplace product detail is not readable');

    await page.goto(`/products/${detail?.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: detail?.title })).toBeVisible();
    const basePrice = await priceText(page);
    expect(basePrice).not.toBe('');
    // The purchase action is present and visibly not connected.
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
    await expect(page.getByText('Checkout is not connected yet.')).toBeVisible();

    const variants = detail?.variants ?? [];
    if (variants.length < 2) return; // nothing to choose; the price path is covered above

    const first = variants[0] as Variant;
    const last = variants[variants.length - 1] as Variant;
    await page.goto(`/products/${detail?.slug}?variant=${last.id}`);

    const lastRadio = page.getByRole('radio', { name: /./ }).last();
    await expect(lastRadio).toBeChecked();
    if (last.priceCents !== first.priceCents) {
      expect(await priceText(page)).not.toBe(basePrice);
    }
  });
});

test.describe('interactive variant selection', () => {
  test('keyboard selection changes the price and records the choice in the URL', async ({
    page,
    request,
  }) => {
    const listed = await firstProduct(request, '/v1/catalog/marketplace/products');
    test.skip(listed === null, 'no published marketplace product seeded yet (T028)');
    const detail = await detailOf(
      request,
      '/v1/catalog/marketplace/products',
      listed?.slug ?? '',
    );
    test.skip(detail === null, 'marketplace product detail is not readable');
    const variants = detail?.variants ?? [];
    test.skip(variants.length < 2, 'the seeded product has a single variant');

    const first = variants[0] as Variant;
    const second = variants[1] as Variant;

    await page.goto(`/products/${detail?.slug}`);
    await page.waitForLoadState('networkidle');
    const basePrice = await priceText(page);

    await page.getByRole('radio').first().focus();
    await page.keyboard.press('ArrowRight');

    await expect(page).toHaveURL(new RegExp(`variant=${second.id}`));
    await expect(page.getByRole('radio').nth(1)).toBeChecked();
    if (second.priceCents !== first.priceCents) {
      expect(await priceText(page)).not.toBe(basePrice);
    }

    // The choice is durable: a reload re-reads it from the URL.
    const chosen = await priceText(page);
    await page.reload();
    await expect(page.getByRole('radio').nth(1)).toBeChecked();
    expect(await priceText(page)).toBe(chosen);
  });

  test('a stale or foreign variant id falls back instead of leaking a price', async ({
    page,
    request,
  }) => {
    const listed = await firstProduct(request, '/v1/catalog/marketplace/products');
    test.skip(listed === null, 'no published marketplace product seeded yet (T028)');

    await page.goto(`/products/${listed?.slug}?variant=33333333-3333-4333-8333-333333333333`);
    // The page still renders the product and selects a real variant.
    await expect(page.getByTestId('pdp-price')).toBeVisible();
    await expect(page.getByRole('radio').first()).toBeChecked();
  });
});

test.describe('product scope matches the route', () => {
  test('an unknown product is a 404, not an empty product page', async ({ page }) => {
    const response = await page.goto('/products/this-product-does-not-exist-xyz');
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('pdp-price')).toHaveCount(0);
  });

  test('each store renders only its own product', async ({ page, request }) => {
    const found: Array<{ store: string; detail: Detail }> = [];
    for (const store of SEEDED_STORES) {
      const listed = await firstProduct(request, `/v1/catalog/stores/${store}/products`);
      if (listed === null) continue;
      const detail = await detailOf(
        request,
        `/v1/catalog/stores/${store}/products`,
        listed.slug,
      );
      if (detail !== null) found.push({ store, detail });
    }
    test.skip(found.length < 2, 'both seeded stores need a published product for this check');

    const [firstStore, secondStore] = found as [
      { store: string; detail: Detail },
      { store: string; detail: Detail },
    ];

    await page.goto(`/stores/${firstStore.store}/products/${firstStore.detail.slug}`);
    await expect(
      page.getByRole('heading', { level: 1, name: firstStore.detail.title }),
    ).toBeVisible();
    await expect(page.getByText(secondStore.detail.title)).toHaveCount(0);

    await page.goto(`/stores/${secondStore.store}/products/${secondStore.detail.slug}`);
    await expect(
      page.getByRole('heading', { level: 1, name: secondStore.detail.title }),
    ).toBeVisible();
    await expect(page.getByText(firstStore.detail.title)).toHaveCount(0);
  });

  test('a marketplace product is not reachable inside an unrelated store', async ({
    page,
    request,
  }) => {
    const marketplace = await firstProduct(request, '/v1/catalog/marketplace/products');
    test.skip(marketplace === null, 'no published marketplace product seeded yet (T028)');
    const detail = await detailOf(
      request,
      '/v1/catalog/marketplace/products',
      marketplace?.slug ?? '',
    );
    test.skip(detail === null, 'marketplace product detail is not readable');

    const foreignStore = SEEDED_STORES.find((store) => store !== detail?.store.slug);
    test.skip(
      foreignStore === undefined,
      'the marketplace product belongs to a seeded store, so there is no unrelated store to test',
    );

    const response = await page.goto(`/stores/${foreignStore}/products/${marketplace?.slug}`);
    expect(response?.status()).toBe(404);
  });
});
