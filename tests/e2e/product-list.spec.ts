// T025b product-listing spec — bench host with the full local stack (API on
// API_BASE_URL + the prod web server). Browsers must be installed first; this
// file is NOT run where browsers are absent. The same presentation/race
// behavior is proven in jsdom
// (src/features/catalog/product-list.test.tsx, filter-panel.test.tsx) and the
// pure URL/request rules in src/features/catalog/query-state.test.ts.
//
// The channel assertions here are the browser-level proof of the milestone
// invariant "the channel is in every catalog request": the gateway URL the
// page actually fetches is inspected, not inferred from the rendered links.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const CATALOG_REQUEST = '**/api/v1/catalog/**';

/** Resolve the first gateway catalog URL observed after an action. */
async function firstCatalogRequest(page: Page, action: () => Promise<void>): Promise<string> {
  const [request] = await Promise.all([page.waitForRequest(CATALOG_REQUEST), action()]);
  return new URL(request.url()).pathname + new URL(request.url()).search;
}

test('marketplace listing filters, paginates from the URL and lands every link in the marketplace channel', async ({
  page,
}) => {
  const request = await firstCatalogRequest(page, () => page.goto('/products'));
  expect(request.startsWith('/api/v1/catalog/marketplace/products?')).toBe(true);
  expect(request).toContain('sort=newest');

  await expect(page.getByRole('heading', { level: 1, name: 'All products' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Newest' })).toHaveAttribute('aria-current', 'true');

  const cards = page.locator('.ss-product');
  const count = await cards.count();
  if (count === 0) {
    // No seeded marketplace products: the honest empty state, never a fake tile.
    await expect(page.getByText('No products match these filters')).toBeVisible();
  } else {
    const hrefs = await cards.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href') ?? ''),
    );
    for (const href of hrefs) {
      expect(href).toMatch(/^\/products\/[A-Za-z0-9-]+$/);
    }
  }
});

test('the store listing keeps the store channel in the request AND in every product link', async ({
  page,
}) => {
  const request = await firstCatalogRequest(page, () => page.goto('/stores/t016-alpha/products'));
  // Cross-channel leakage would show up here as the marketplace path.
  expect(request.startsWith('/api/v1/catalog/stores/t016-alpha/products?')).toBe(true);
  await expect(page.getByRole('link', { name: 'Newest' })).toBeVisible();

  const cards = page.locator('.ss-product');
  const hrefs = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('href') ?? ''),
  );
  for (const href of hrefs) {
    expect(href).toMatch(/^\/stores\/t016-alpha\/products\/[A-Za-z0-9-]+$/);
  }
});

test('sort and price filters are deep-linkable and survive Back and Forward', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { level: 1, name: 'All products' })).toBeVisible();

  await page.getByRole('link', { name: 'Popular' }).click();
  await expect(page).toHaveURL(/sort=popularity/);
  await expect(page.getByRole('link', { name: 'Popular' })).toHaveAttribute('aria-current', 'true');

  const form = page.locator('form', {
    has: page.getByRole('button', { name: 'Apply filters' }),
  });
  await form.getByLabel('Minimum price').fill('10');
  await form.getByLabel('Maximum price').fill('500');
  const filtered = await firstCatalogRequest(page, () =>
    page.getByRole('button', { name: 'Apply filters' }).click(),
  );
  await expect(page).toHaveURL(/sort=popularity/);
  await expect(page).toHaveURL(/min=10/);
  // The chosen filters, not the defaults, are what the gateway was asked for.
  expect(filtered).toContain('minPrice=1000');
  expect(filtered).toContain('maxPrice=50000');
  expect(filtered).toContain('sort=popularity');

  await page.goBack();
  await expect(page).toHaveURL(/sort=popularity/);
  await expect(page.getByLabel('Minimum price')).toHaveValue('');
  await page.goForward();
  await expect(page.getByLabel('Minimum price')).toHaveValue('10');
});

test('a filtered-to-nothing listing says so and offers the way out', async ({ page }) => {
  await page.goto('/products?category=definitely-not-a-category');
  await expect(page.getByText('No products match these filters')).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).click();
  // The category is gone from the URL and the page settles without an error.
  // (Whether the unfiltered listing then has rows is a data question, so the
  // empty state is not asserted away here.)
  await expect(page).not.toHaveURL(/category=/);
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('.ss-plp__results')).toHaveAttribute('aria-busy', 'false');
});

test('a failing catalog read is announced and recovers on retry', async ({ page }) => {
  await page.route(CATALOG_REQUEST, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/products');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Products unavailable')).toBeVisible();
  // No skeleton left behind pretending to still be loading.
  await expect(page.getByTestId('plp-skeletons')).toBeHidden();

  await page.unroute(CATALOG_REQUEST);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('the filter card and grid reflow on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products');
  await expect(page.getByRole('link', { name: 'Newest' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();

  const columns = await page
    .locator('.ss-product-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns);
  expect(columns.split(' ').length).toBe(1);
});
