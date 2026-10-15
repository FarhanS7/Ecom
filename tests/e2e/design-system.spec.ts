// T023b design-system spec — bench host with the full local stack and the
// seeded storefronts (t016-alpha/t016-beta). Browsers must be installed
// (`pnpm exec playwright install --with-deps chromium`). NOT run where
// browsers are absent (the agent host has none): the same token behavior is
// proven in jsdom (src/components/ui.test.tsx) and the token mapping in
// src/components/theme.test.ts.
//
// Screenshots are written for HUMAN inspection at 390/768/1024/1440. Visual
// baseline diffing is intentionally not enabled here: pixel baselines need a
// recorded bench host with pinned fonts/images, which this environment
// cannot produce — claiming a screenshot comparison would be dishonest.

import { expect, test } from '@playwright/test';

const WIDTHS = [390, 768, 1024, 1440];

function rootToken(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate(
    (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
    name,
  );
}

test('design tokens resolve, with the mobile exceptions at 390', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const radius = await rootToken(page, '--radius-card');
    const gap = await rootToken(page, '--grid-gap');
    const accent = await rootToken(page, '--color-accent');
    if (width < 768) {
      expect(radius).toBe('22px');
      expect(gap).toBe('12px');
    } else {
      expect(radius).toBe('28px');
      expect(gap).toBe('16px');
    }
    // The lime CTA is a token, never inlined in a component.
    expect(accent).toBe('#dcf75a');
  }
});

test('both seeded themes swap through tokens with zero code change', async ({ page }) => {
  await page.goto('/stores/t016-alpha');
  const alpha = await page
    .getByTestId('store-theme')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--color-brand').trim());
  await page.goto('/stores/t016-beta');
  const beta = await page
    .getByTestId('store-theme')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--color-brand').trim());
  expect(alpha).toBe('#111111');
  expect(beta).toBe('#222222');
  expect(alpha).not.toBe(beta);
});

test('the shell is a floating pill header with named icon controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search products' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Cart/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wishlist' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('reduced motion disables the float/drift durations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await rootToken(page, '--dur-slow')).toBe('0ms');
  expect(await rootToken(page, '--dur')).toBe('0ms');
});

test('keyboard focus shows the 2px design focus ring', async ({ page }) => {
  await page.goto('/');
  let focused = '';
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '',
    );
    if (focused.startsWith('Cart')) break;
  }
  expect(focused.startsWith('Cart')).toBe(true);
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, offset: style.outlineOffset };
  });
  expect(outline?.width).toBe('2px');
  expect(outline?.offset).toBe('3px');
});

test('screenshots at 390/768/1024/1440 for human inspection', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.screenshot({
      path: `tests/e2e/__screenshots__/home-${width}.png`,
      fullPage: true,
    });
  }
});
