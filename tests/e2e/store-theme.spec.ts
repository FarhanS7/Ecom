// T016b storefront spec — bench host with the full local stack and seeded
// storefronts (slugs t016-alpha/t016-beta active with distinct themes,
// t016-grey suspended). Browsers must be installed first. NOT run where
// browsers are absent; the same behaviors are covered by backend unit +
// integration suites and the T016 commit's curl battery.

import { expect, test } from '@playwright/test';

test('two storefronts render their own themes', async ({ page }) => {
  await page.goto('/stores/t016-alpha');
  const alpha = await page.getByTestId('store-theme').getAttribute('style');
  await page.goto('/stores/t016-beta');
  const beta = await page.getByTestId('store-theme').getAttribute('style');
  expect(alpha).toContain('#111111');
  expect(beta).toContain('#222222');
  expect(alpha).not.toBe(beta);
});

test('unknown and suspended storefronts are unavailable', async ({ page }) => {
  await page.goto('/stores/t016-missing');
  await expect(page.getByText(/not found/i).first()).toBeVisible();
  await page.goto('/stores/t016-grey');
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});
