// tests/e2e/admin-approval.spec.ts - E2E tests for platform admin seller approval and category management (T069).

import { expect, test } from '@playwright/test';

const MOCK_STORE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test.describe('Platform Admin Moderation & Workflows (T069)', () => {
  test('platform admin views pending merchant applications, approves store, and manages categories', async ({ page }) => {
    // 1. Mock admin authentication
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'admin@shopscale.dev', id: 'admin-1', roles: ['admin'] }),
      });
    });

    // 2. Mock admin store listing
    await page.route('**/api/v1/admin/stores*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: MOCK_STORE_ID,
              businessId: 'biz-1',
              slug: 'apex-athletics',
              name: 'Apex Athletics',
              status: 'pending',
              ownerEmail: 'seller@apex.com',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    // 3. Mock store approval mutation
    await page.route(`**/api/v1/admin/stores/${MOCK_STORE_ID}/approve`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          storeId: MOCK_STORE_ID,
          status: 'active',
        }),
      });
    });

    // Auto-confirm window.confirm
    page.on('dialog', (dialog) => dialog.accept());

    // 4. Navigate to admin sellers page
    await page.goto('/admin/sellers');

    // Verify page title and store row
    await expect(page.getByRole('heading', { name: /Merchant Applications/i })).toBeVisible();
    await expect(page.getByText('Apex Athletics')).toBeVisible();
    await expect(page.getByTestId(`status-badge-${MOCK_STORE_ID}`)).toHaveText('pending');

    // 5. Click Approve button
    const approveBtn = page.getByTestId(`approve-btn-${MOCK_STORE_ID}`);
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // 6. Verify status transitions to active and success banner appears
    await expect(page.getByTestId('admin-banner')).toBeVisible();
    await expect(page.getByTestId(`status-badge-${MOCK_STORE_ID}`)).toHaveText('active');

    // 7. Test Category Hierarchy navigation
    await page.route('**/api/v1/categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'cat-1',
              parentId: null,
              slug: 'sports',
              name: 'Sports & Outdoors',
              path: '/sports/',
            },
          ],
        }),
      });
    });

    await page.goto('/admin/categories');
    await expect(page.getByRole('heading', { name: /Catalog Category Hierarchy/i })).toBeVisible();
    await expect(page.getByText('Sports & Outdoors')).toBeVisible();
    await expect(page.getByText('/sports/')).toBeVisible();
  });
});
