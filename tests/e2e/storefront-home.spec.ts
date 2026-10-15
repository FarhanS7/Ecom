// T024b storefront home spec — bench host with the full local stack and the
// seeded storefronts (t016-alpha/t016-beta). Browsers must be installed first.
// NOT run where browsers are absent; the same presentation behavior is proven
// in jsdom (src/features/storefront/home.test.tsx) and the wiring by the
// server-render checks recorded in docs/reviews/t024-context.md.
//
// Link TARGETS are asserted, not navigated: the PLP (/products,
// /stores/{slug}/products) and PDP arrive with T025/T026, so following them
// would 404 today. Navigation IS exercised where the route exists (the store
// → marketplace cross-link).

import { expect, test } from '@playwright/test';

const MARKET_HERO = 'ShopScale Marketplace';

async function productHrefs(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('.ss-product').evaluateAll((cards) =>
    cards.map((card) => (card as HTMLAnchorElement).getAttribute('href') ?? ''),
  );
}

test('marketplace home is product-first and degrades honestly when empty', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: MARKET_HERO })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View All Products' })).toHaveAttribute(
    'href',
    '/products',
  );
  // The T007 shell contract still holds on the same page.
  await expect(page.getByTestId('api-liveness')).toBeVisible();

  const hrefs = await productHrefs(page);
  if (hrefs.length === 0) {
    // No seeded marketplace products: an HONEST message, never a fake tile.
    await expect(
      page.getByText(/No products are published yet\.|The catalog is temporarily unavailable\./),
    ).toBeVisible();
  } else {
    for (const href of hrefs) {
      expect(href).toMatch(/^\/products\/[A-Za-z0-9-]+$/);
    }
  }
});

test('two store homes render their own theme and only their own products', async ({ page }) => {
  for (const slug of ['t016-alpha', 't016-beta']) {
    await page.goto(`/stores/${slug}`);
    await expect(page.getByTestId('store-theme')).toHaveAttribute('data-tenant', '');
    await expect(page.getByTestId('store-theme')).toHaveAttribute('data-store', slug);
    // The hero's CTA is store-scoped, not marketplace-scoped.
    await expect(page.getByRole('link', { name: 'View All Products' })).toHaveAttribute(
      'href',
      `/stores/${slug}/products`,
    );

    const hrefs = await productHrefs(page);
    if (hrefs.length === 0) {
      await expect(
        page.getByText(/No products are published yet\.|The catalog is temporarily unavailable\./),
      ).toBeVisible();
    } else {
      for (const href of hrefs) {
        // Cross-store leakage would show as a marketplace or sibling-store link.
        expect(href).toMatch(new RegExp(`^/stores/${slug}/products/[A-Za-z0-9-]+$`));
      }
    }
  }
});

test('the store home links back to the marketplace and lands there', async ({ page }) => {
  await page.goto('/stores/t016-alpha');
  await page.getByRole('link', { name: '← Marketplace' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: MARKET_HERO })).toBeVisible();
});

test('the primary CTA is keyboard operable with a visible focus ring', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'View All Products' }).focus();
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, offset: style.outlineOffset };
  });
  expect(outline?.width).toBe('2px');
});
