// Root Playwright configuration (T007b; extended by T008 CI wiring).
// Browsers are NOT installed in every environment: run
// `pnpm exec playwright install --with-deps chromium` on the bench host first.
// The suite needs the full local stack: `pnpm infra:up`, the API on
// API_BASE_URL (default http://127.0.0.1:3001), and `pnpm dev:web` (or the
// prod server) on BASE_URL (default http://127.0.0.1:3000).

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @shopscale/web run start -- --port 3000',
    url: 'http://127.0.0.1:3000/',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      API_BASE_URL: process.env.API_BASE_URL ?? 'http://127.0.0.1:3001',
    },
  },
});
