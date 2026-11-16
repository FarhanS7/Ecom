// tests/e2e/checkout.spec.ts - E2E test for multi-step checkout and pending order flow (T048).

import { expect, test } from '@playwright/test';

const MOCK_ORDER_ID = '88888888-8888-4888-8888-888888888888';
const MOCK_STORE_ID = '99999999-9999-4999-9999-999999999999';
const MOCK_VARIANT_ID = '11111111-1111-4111-8111-111111111111';

test.describe('Checkout & Pending Order Confirmation (T048)', () => {
  test('completes purchase flow from address selection to pending confirmation screen', async ({
    page,
  }) => {
    // 1. Mock Cart GET
    await page.route('**/api/v1/carts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'cart-123',
          channelKey: 'marketplace',
          items: [
            {
              variantId: MOCK_VARIANT_ID,
              qty: 1,
              title: 'Artisan Mechanical Keyboard',
              priceCents: '15000',
              available: true,
            },
          ],
          totalCents: '15000',
          version: 1,
        }),
      });
    });

    // 2. Mock Addresses GET
    await page.route('**/api/v1/me/addresses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'addr-test-1',
              fields: {
                name: 'Jane Smith',
                line1: '123 Market Street',
                city: 'San Francisco',
                region: 'CA',
                postalCode: '94105',
                country: 'United States',
              },
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      });
    });

    // 3. Mock Quote POST
    await page.route('**/api/v1/checkout/quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          quoteToken: 'signed-quote-token-for-e2e',
          currency: 'USD',
          itemsSubtotalCents: 15000,
          discountCents: 0,
          shippingCents: 500,
          taxCents: 0,
          totalCents: 15500,
          sellers: [
            {
              storeId: MOCK_STORE_ID,
              storeName: 'KeyCrafters',
              itemsSubtotalCents: 15000,
              discountCents: 0,
              shippingCents: 500,
              sellerTotalCents: 15500,
              items: [
                {
                  variantId: MOCK_VARIANT_ID,
                  title: 'Artisan Mechanical Keyboard',
                  qty: 1,
                  unitPriceCents: 15000,
                  lineSubtotalCents: 15000,
                  lineDiscountCents: 0,
                  lineTotalCents: 15000,
                },
              ],
            },
          ],
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        }),
      });
    });

    // 4. Mock Checkout POST
    await page.route('**/api/v1/checkout', async (route) => {
      // Assert Idempotency-Key header is present
      const headers = route.request().headers();
      expect(headers['idempotency-key']).toBeTruthy();

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: MOCK_ORDER_ID,
          status: 'PENDING',
          paymentEffectKey: 'pay_eff_mock_123',
          totalCents: '15500',
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        }),
      });
    });

    // Navigate to /checkout
    await page.goto('/checkout');

    // Step 1: Address selection
    await expect(page.getByTestId('address-step')).toBeVisible();
    await expect(page.getByText('Jane Smith')).toBeVisible();
    await expect(page.getByText('123 Market Street')).toBeVisible();

    // Advance to Step 2: Review
    await page.getByTestId('continue-to-review-btn').click();

    // Step 2: Review Summary
    await expect(page.getByTestId('order-summary-step')).toBeVisible();
    await expect(page.getByText('Vendor: KeyCrafters')).toBeVisible();
    await expect(page.getByText('Artisan Mechanical Keyboard')).toBeVisible();

    // Click Place Order
    await page.getByTestId('place-order-btn').click();

    // Verify redirect to /orders/[orderId]/pending
    await expect(page).toHaveURL(`/orders/${MOCK_ORDER_ID}/pending`);
    await expect(page.getByTestId('pending-order-screen')).toBeVisible();
    await expect(page.getByTestId('order-status-badge')).toHaveText('Payment Pending');
    await expect(page.getByTestId('pending-order-id')).toHaveText(MOCK_ORDER_ID);
  });
});
