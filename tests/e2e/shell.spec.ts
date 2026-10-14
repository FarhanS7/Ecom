// T007b shell spec — runs on the bench host with the full local stack.
// Requires: API reachable at the web server's API_BASE_URL, web server on
// BASE_URL. Browsers must be installed
// (`pnpm exec playwright install --with-deps chromium`).
// NOT run in environments without browsers; HTTP-level evidence for the same
// behaviors lives in the T007 commits (curl + bundle inspection).

import { expect, test } from '@playwright/test';

test('shell loads with server-rendered API health state', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ShopScale/);
  await expect(page.getByRole('heading', { name: 'ShopScale Marketplace' })).toBeVisible();
  const liveness = page.getByTestId('api-liveness');
  await expect(liveness).toContainText(/ok|degraded|unreachable/);
  await expect(page.getByTestId('api-readiness')).toContainText(/ok|degraded|unreachable/);
});

test('browser gateway probe answers through the same origin', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('gateway-probe')).toContainText(/Gateway (ok|error)/, { timeout: 15_000 });
});

test('gateway rejects injection targets', async ({ request }) => {
  // Dot-segment paths are normalized by clients before sending, so injection
  // probes use forms that reach the route intact: scheme smuggling and
  // off-allowlist suffixes.
  for (const target of ['/api/https:/evil.example', '/api/v1/ping/extra']) {
    const res = await request.get(target);
    expect(res.status()).toBe(404);
  }
  const injection = await request.get('/api/v1/ping?limit=999');
  expect(injection.status()).toBe(422);
});
