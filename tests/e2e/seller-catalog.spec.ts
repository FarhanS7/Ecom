// T027c seller console journey — bench host with the full local stack (API on
// API_BASE_URL, the prod web server on BASE_URL, live Postgres/Redis).
//
// The console is a signed-in, store-scoped surface: it needs a seller account
// that owns or helps run a store, and there is deliberately no public route
// that creates one (T013-T015 onboarding is API-only today). So this spec reads
// the seller it should use from the environment and SKIPS WITH AN EXPLICIT
// REASON when they are absent — never a green result earned by asserting
// nothing:
//
//   SELLER_E2E_EMAIL / SELLER_E2E_PASSWORD  a store member with catalog:manage
//   SELLER_E2E_STORE_ID                     that store's uuid (the console URL)
//   SELLER_E2E_STORE_SLUG                   that store's public slug (storefront)
//
// Browsers must be installed first. The same lifecycle is asserted over real
// HTTP against live Postgres in apps/api/tests/integration/catalog-write.spec.ts
// (CI, no skip), and every presentation rule in jsdom (features/seller/*.test).
// What only a browser can prove is the wiring: server actions reached from the
// console, the shared product version across the three panels, and the public
// read outcomes after each channel change.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const EMAIL = process.env.SELLER_E2E_EMAIL;
const PASSWORD = process.env.SELLER_E2E_PASSWORD;
const STORE_ID = process.env.SELLER_E2E_STORE_ID;
const STORE_SLUG = process.env.SELLER_E2E_STORE_SLUG;

const missing = [
  ['SELLER_E2E_EMAIL', EMAIL],
  ['SELLER_E2E_PASSWORD', PASSWORD],
  ['SELLER_E2E_STORE_ID', STORE_ID],
  ['SELLER_E2E_STORE_SLUG', STORE_SLUG],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)
  .join(', ');

/** Unique per run so repeated runs never collide on the scoped slug. */
function freshSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL ?? '');
  await page.getByLabel('Password').fill(PASSWORD ?? '');
  await page.getByRole('button', { name: 'Log in' }).press('Enter');
  await expect(page.getByText(/Welcome back/)).toBeVisible();
}

/** The console URL for a store's product list. */
function consoleUrl(): string {
  return `/seller/${STORE_ID}/products`;
}

/** Creates a draft product and returns the slug it was given. */
async function createProduct(page: Page, title: string): Promise<string> {
  const slug = freshSlug('t027');
  await page.goto(consoleUrl());
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Web address (slug)').fill(slug);
  await page.getByRole('button', { name: 'Create product' }).press('Enter');
  // Creation opens the new product's editor.
  await expect(page).toHaveURL(/\/seller\/[^/]+\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return slug;
}

/** A public read assertion: the HTTP status the shopper's route answered. */
async function publicRead(page: Page, url: string): Promise<number> {
  const response = await page.goto(url);
  return response?.status() ?? 0;
}

test('a signed-out visitor gets the sign-in prompt and no console data', async ({ page }) => {
  // A well-formed but unknown store: the API answers 401 before it considers
  // the store at all, so this needs no provisioned data — and it must never
  // render a product list, a store name, or a 404 that confirms the store.
  await page.goto('/seller/00000000-0000-4000-8000-000000000000/products');
  await expect(page.getByRole('heading', { name: 'Sign in to manage your store' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test.describe('seller console (needs a provisioned store member with catalog:manage)', () => {
  test.skip(missing !== '', `seller console e2e needs ${missing}`);

  test('a product is invisible while draft, becomes visible per channel, then archived', async ({
    page,
  }) => {
    await login(page);
    const title = `T027 Console Lamp ${Date.now()}`;
    const slug = await createProduct(page, title);

    // Draft, both channels off: invisible on both public reads.
    expect(await publicRead(page, `/stores/${STORE_SLUG}/products/${slug}`)).toBe(404);
    expect(await publicRead(page, `/products/${slug}`)).toBe(404);

    // Back to the editor: add an active variant (the price comes from variants).
    await page.goto(consoleUrl());
    await page.getByRole('link', { name: title }).click();
    await page.getByLabel('SKU').fill(freshSlug('t027-sku').toUpperCase());
    await page.getByLabel('Price').fill('42.50');
    await page.getByRole('button', { name: 'Add variant' }).press('Enter');
    await expect(page.getByText(/Added /)).toBeVisible();

    // Publishing moves the product out of draft (it needs the active variant).
    await page.getByRole('button', { name: 'Publish' }).press('Enter');
    await expect(page.getByText('Product published.')).toBeVisible();

    // Published but not listed: the store channel is still off, so still 404.
    expect(await publicRead(page, `/stores/${STORE_SLUG}/products/${slug}`)).toBe(404);

    // Opt into the store channel only: visible there, still 404 in the marketplace.
    await page.goto(consoleUrl());
    await page.getByRole('link', { name: title }).click();
    await page.getByRole('button', { name: 'List on store' }).press('Enter');
    await expect(page.getByText('Listed on the store channel.')).toBeVisible();
    expect(await publicRead(page, `/stores/${STORE_SLUG}/products/${slug}`)).toBe(200);
    await expect(page.getByText(title)).toBeVisible();
    expect(await publicRead(page, `/products/${slug}`)).toBe(404);

    // Opt into the marketplace too: visible on both channels.
    await page.goto(consoleUrl());
    await page.getByRole('link', { name: title }).click();
    await page.getByRole('button', { name: 'List on marketplace' }).press('Enter');
    await expect(page.getByText('Listed on the marketplace.')).toBeVisible();
    expect(await publicRead(page, `/products/${slug}`)).toBe(200);

    // The channels are independent: unlisting the store leaves the marketplace up.
    await page.goto(consoleUrl());
    await page.getByRole('link', { name: title }).click();
    await page.getByRole('button', { name: 'Unlist from store' }).press('Enter');
    await expect(page.getByText('Unlisted from the store channel.')).toBeVisible();
    expect(await publicRead(page, `/stores/${STORE_SLUG}/products/${slug}`)).toBe(404);
    expect(await publicRead(page, `/products/${slug}`)).toBe(200);

    // Archive is terminal and needs a second, explicit confirmation.
    await page.goto(consoleUrl());
    await page.getByRole('link', { name: title }).click();
    await page.getByRole('button', { name: 'Archive' }).press('Enter');
    await page.getByRole('button', { name: 'Confirm archive' }).press('Enter');
    await expect(page.getByText('Product archived.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unpublish' })).toBeDisabled();

    expect(await publicRead(page, `/products/${slug}`)).toBe(404);
    expect(await publicRead(page, `/stores/${STORE_SLUG}/products/${slug}`)).toBe(404);
  });

  test('the server refuses an empty title and keeps what was typed', async ({ page }) => {
    await login(page);
    await page.goto(consoleUrl());

    await page.getByLabel('Title').fill('');
    await page.getByLabel('Web address (slug)').fill(freshSlug('t027-bad'));
    await page.getByRole('button', { name: 'Create product' }).press('Enter');

    // The message comes from the server action (the API's own contract rules).
    await expect(page.getByText('1 field needs attention:')).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    // The typed slug survives the rejection.
    await expect(page.getByLabel('Web address (slug)')).toHaveValue(/t027-bad/);
  });

  test('a member without catalog:manage cannot open the editor', async ({ page }) => {
    const viewerEmail = process.env.SELLER_E2E_VIEWER_EMAIL;
    const viewerPassword = process.env.SELLER_E2E_VIEWER_PASSWORD;
    test.skip(
      !viewerEmail || !viewerPassword,
      'needs SELLER_E2E_VIEWER_EMAIL / SELLER_E2E_VIEWER_PASSWORD (same store, no catalog:manage)',
    );

    await page.goto('/login');
    await page.getByLabel('Email').fill(viewerEmail ?? '');
    await page.getByLabel('Password').fill(viewerPassword ?? '');
    await page.getByRole('button', { name: 'Log in' }).press('Enter');
    await expect(page.getByText(/Welcome back/)).toBeVisible();

    // The API collapses "not a member" and "member without catalog:manage" into
    // one generic 404 (T018), so the console must answer the same way — never a
    // hint that the store exists and merely needs different rights.
    const response = await page.goto(consoleUrl());
    expect(response?.status()).toBe(404);
  });

  test('a stale editor is told to reload or apply, never silently overwritten', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL });
    const first = await context.newPage();
    const second = await context.newPage();
    const title = `T027 Conflict Lamp ${Date.now()}`;

    await login(first);
    await createProduct(first, title);
    await second.goto(first.url());

    // The first editor wins the race and bumps the version.
    await first.getByLabel('Description').fill('Written first.');
    await first.getByRole('button', { name: 'Save changes' }).press('Enter');
    await expect(first.getByRole('status')).toHaveText('Saved.');

    // The second editor now saves against a version that no longer exists.
    await second.getByLabel('Title').fill(`${title} (second)`);
    await second.getByRole('button', { name: 'Save changes' }).press('Enter');

    await expect(second.getByRole('button', { name: 'Reload latest' })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Apply my changes' })).toBeVisible();

    // Reload latest adopts the other writer's values instead of overwriting them.
    await second.getByRole('button', { name: 'Reload latest' }).press('Enter');
    await expect(second.getByLabel('Description')).toHaveValue('Written first.');

    await context.close();
  });
});
