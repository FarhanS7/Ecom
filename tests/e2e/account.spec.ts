// T017b account journeys — bench host with the full local stack.
// Register → login → session panel → logout → password reset request, all
// keyboard-operable; asserts no password material in browser storage.
// Browsers must be installed first. NOT run where browsers are absent;
// the same behaviors are covered by API suites + the T017 commit's prod
// curl battery + storage grep below.

import { expect, test } from '@playwright/test';

const EMAIL = 't017.e2e@example.com';
const PASSWORD = 'correct-horse-99';

test('register, login, session panel, and logout', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Register' }).press('Enter');
  await expect(page.getByText(/Account created/)).toBeVisible();

  await page.goto('/account');
  await expect(page.getByText(new RegExp(EMAIL))).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).press('Enter');
  await expect(page.getByText(/logged out/i)).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).press('Enter');
  await expect(page.getByText(/Welcome back/)).toBeVisible();
});

test('password reset request is generic and announced', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Send reset link' }).press('Enter');
  await expect(page.getByText(/on its way/)).toBeVisible();
});

test('no password material persists in browser storage', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).press('Enter');
  const storage = await context.storageState();
  const dump = JSON.stringify({ origins: storage.origins, cookies: storage.cookies.map((c) => c.name) });
  expect(dump).not.toContain(PASSWORD);
  expect(dump).not.toContain('password');
  const localKeys = await page.evaluate(() => Object.keys({ ...localStorage, ...sessionStorage }));
  expect(localKeys).toHaveLength(0);
});
