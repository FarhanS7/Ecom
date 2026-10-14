// T091b address book journeys — bench host with the full local stack.
// Register → /account → add address → edit → two-step delete, all
// keyboard-operable; validation errors announced with input preserved.
// Browsers must be installed first. NOT run where browsers are absent;
// the same behaviors are covered by the API suites + the T091 commit's
// prod curl battery (gateway prefix round-trip + rejection) below.

import { expect, test } from '@playwright/test';

const EMAIL = 't091.e2e@example.com';
const PASSWORD = 'address-horse-42';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).press('Enter');
  await expect(page.getByText(/Welcome back/)).toBeVisible();
}

test('create, edit, and delete an address', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Register' }).press('Enter');
  await expect(page.getByText(/Account created/)).toBeVisible();

  await login(page);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Addresses' })).toBeVisible();
  await expect(page.getByText(/No saved addresses yet/)).toBeVisible();

  await page.getByLabel('Full name').fill('T091 E2E');
  await page.getByLabel('Street').fill('1 Benchmark Road');
  await page.getByLabel('City').fill('Testville');
  await page.getByLabel('Region').fill('TS');
  await page.getByLabel('Postal code').fill('00001');
  await page.getByLabel('Country (2 letters)').fill('US');
  await page.getByRole('button', { name: 'Add address' }).press('Enter');
  await expect(page.getByText('T091 E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).first().press('Enter');
  await page.getByLabel('Street').fill('2 Benchmark Avenue');
  await page.getByRole('button', { name: 'Save changes' }).press('Enter');
  await expect(page.getByText('2 Benchmark Avenue')).toBeVisible();

  // Two-step delete: confirm inline, no dialog trap.
  await page.getByRole('button', { name: 'Delete' }).first().press('Enter');
  await page.getByRole('button', { name: 'Confirm delete' }).press('Enter');
  await expect(page.getByText(/No saved addresses yet/)).toBeVisible();
});

test('invalid submit announces the error and preserves input', async ({ page }) => {
  await login(page);
  await page.goto('/account');
  await page.getByLabel('Full name').fill('Kept Name');
  await page.getByLabel('Street').fill('3 Kept Street');
  await page.getByLabel('Country (2 letters)').fill('USA'); // 3 letters → 422
  await page.getByRole('button', { name: 'Add address' }).press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue('Kept Name');
  await expect(page.getByLabel('Street')).toHaveValue('3 Kept Street');
});
