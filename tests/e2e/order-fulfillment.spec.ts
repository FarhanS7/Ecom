// tests/e2e/order-fulfillment.spec.ts - E2E test for customer order tracking & seller fulfillment (T057).

import { expect, test } from '@playwright/test';

const MOCK_ORDER_ID = '77777777-7777-4777-8777-777777777777';
const MOCK_SUBORDER_ID = '66666666-6666-4666-8666-666666666666';
const MOCK_STORE_ID = '55555555-5555-4555-8555-555555555555';
const MOCK_VARIANT_ID = '11111111-1111-4111-8111-111111111111';

test.describe('Customer Order Tracking and Seller Fulfillment (T057)', () => {
  test('renders customer order list and detail tracking stepper', async ({ page }) => {
    // 1. Mock auth
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'buyer@test.com', id: 'user-1' }),
      });
    });

    // 2. Mock customer orders list
    await page.route('**/api/v1/orders?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: MOCK_ORDER_ID,
              channelKey: 'marketplace',
              paymentStatus: 'PAID',
              fulfillmentStatus: 'SHIPPED',
              subtotalCents: 15000,
              shippingCents: 1000,
              discountCents: 0,
              totalCents: 16000,
              currency: 'USD',
              createdAt: new Date().toISOString(),
              itemsCount: 1,
            },
          ],
          nextCursor: null,
        }),
      });
    });

    // 3. Mock customer order detail
    await page.route(`**/api/v1/orders/${MOCK_ORDER_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_ORDER_ID,
          channelKey: 'marketplace',
          paymentStatus: 'PAID',
          fulfillmentStatus: 'SHIPPED',
          subtotalCents: 15000,
          shippingCents: 1000,
          discountCents: 0,
          totalCents: 16000,
          currency: 'USD',
          createdAt: new Date().toISOString(),
          address: {
            fullName: 'John Doe',
            line1: '123 Market St',
            city: 'Portland',
            state: 'OR',
            postalCode: '97201',
            country: 'USA',
          },
          suborders: [
            {
              id: MOCK_SUBORDER_ID,
              orderId: MOCK_ORDER_ID,
              storeId: MOCK_STORE_ID,
              fulfillmentStatus: 'SHIPPED',
              subtotalCents: 15000,
              shippingCents: 1000,
              discountCents: 0,
              totalCents: 16000,
              commissionBpsSnapshot: 1000,
              trackingRef: 'TRACK-EXPRESS-1234',
              carrier: 'DHL Express',
              createdAt: new Date().toISOString(),
              items: [
                {
                  id: 'item-1',
                  orderId: MOCK_ORDER_ID,
                  sellerOrderId: MOCK_SUBORDER_ID,
                  storeId: MOCK_STORE_ID,
                  variantId: MOCK_VARIANT_ID,
                  title: 'Minimalist Leather Boots',
                  sku: 'BOOT-001',
                  qty: 1,
                  unitPriceCents: 15000,
                  totalCents: 15000,
                  discountCents: 0,
                },
              ],
            },
          ],
          items: [],
        }),
      });
    });

    // Navigate to customer orders
    await page.goto('/account/orders');

    // Assert order card is displayed
    const orderCard = page.locator(`[data-testid="order-card-${MOCK_ORDER_ID}"]`);
    await expect(orderCard).toBeVisible();

    // Click to view order detail
    await page.click(`[data-testid="view-order-${MOCK_ORDER_ID}"]`);

    // Verify stepper and tracking
    await expect(page.locator('[data-testid="order-progress-stepper"]')).toBeVisible();
    await expect(page.locator('[data-testid="tracking-info"]')).toContainText('TRACK-EXPRESS-1234');
    await expect(page.locator('[data-testid="delivery-address-card"]')).toContainText('John Doe');
  });
});
