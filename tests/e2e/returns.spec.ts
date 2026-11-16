// tests/e2e/returns.spec.ts - E2E test for customer return requests & seller inspection console (T059).

import { expect, test } from '@playwright/test';

const MOCK_ORDER_ID = '88888888-8888-4888-8888-888888888888';
const MOCK_SUBORDER_ID = '77777777-7777-4777-8777-777777777777';
const MOCK_STORE_ID = '66666666-6666-4666-8666-666666666666';
const MOCK_ITEM_ID = '55555555-5555-4555-8555-555555555555';
const MOCK_RETURN_ID = '44444444-4444-4444-8444-444444444444';

test.describe('Customer Returns and Seller Inspection Console (T059)', () => {
  test('customer submits return request and seller inspects/approves return', async ({ page }) => {
    // 1. Mock authentication
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'buyer@test.com', id: 'user-1' }),
      });
    });

    // 2. Mock delivered order detail
    await page.route(`**/api/v1/orders/${MOCK_ORDER_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_ORDER_ID,
          userId: 'user-1',
          channelKey: 'marketplace',
          paymentStatus: 'PAID',
          fulfillmentStatus: 'DELIVERED',
          subtotalCents: 5000,
          shippingCents: 500,
          discountCents: 0,
          totalCents: 5500,
          currency: 'USD',
          createdAt: new Date().toISOString(),
          itemsCount: 1,
          address: {
            fullName: 'Jane Customer',
            line1: '456 Rose St',
            city: 'Seattle',
            state: 'WA',
            postalCode: '98101',
            country: 'USA',
          },
          suborders: [
            {
              id: MOCK_SUBORDER_ID,
              orderId: MOCK_ORDER_ID,
              storeId: MOCK_STORE_ID,
              fulfillmentStatus: 'DELIVERED',
              subtotalCents: 5000,
              shippingCents: 500,
              discountCents: 0,
              totalCents: 5500,
              items: [],
            },
          ],
          items: [
            {
              id: MOCK_ITEM_ID,
              orderId: MOCK_ORDER_ID,
              sellerOrderId: MOCK_SUBORDER_ID,
              storeId: MOCK_STORE_ID,
              variantId: '11111111-1111-4111-8111-111111111111',
              titleSnapshot: 'Waterproof Rain Parka',
              skuSnapshot: 'PARKA-BLU-L',
              qty: 2,
              unitPriceCents: 2500,
              totalCents: 5000,
            },
          ],
        }),
      });
    });

    // 3. Mock customer existing returns for this order
    await page.route(`**/api/v1/orders/${MOCK_ORDER_ID}/returns`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: MOCK_RETURN_ID,
            orderId: MOCK_ORDER_ID,
            sellerOrderId: MOCK_SUBORDER_ID,
            storeId: MOCK_STORE_ID,
            orderItemId: MOCK_ITEM_ID,
            userId: 'user-1',
            qty: 1,
            reason: 'Defective or damaged item',
            customerNotes: 'Zipper is stuck',
            status: 'PENDING_INSPECTION',
            inspectionNotes: null,
            createdAt: new Date().toISOString(),
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    // 4. Visit customer return page
    await page.goto(`/account/orders/${MOCK_ORDER_ID}/return`);

    // Verify page content
    await expect(page.getByRole('heading', { name: /Order Return Request/i })).toBeVisible();
    await expect(page.getByText(/Start a Return/i)).toBeVisible();

    // Fill customer notes and submit
    await page.getByLabel(/Customer notes/i).fill('Zipper is stuck');
    await page.getByRole('button', { name: /Submit Return Request/i }).click();

    // Verify success banner and new return item displayed
    await expect(page.getByText(/Return request for 1 item\(s\) submitted successfully/i)).toBeVisible();
    await expect(page.getByText(/PENDING INSPECTION/i)).toBeVisible();

    // 5. Seller store membership & inspection mock
    await page.route(`**/api/v1/seller/stores/${MOCK_STORE_ID}/membership`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          role: 'owner',
          permissions: ['fulfillment:manage', 'catalog:manage'],
        }),
      });
    });

    // 6. Mock store return requests list
    await page.route(`**/api/v1/seller/stores/${MOCK_STORE_ID}/returns`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: MOCK_RETURN_ID,
            orderId: MOCK_ORDER_ID,
            sellerOrderId: MOCK_SUBORDER_ID,
            storeId: MOCK_STORE_ID,
            orderItemId: MOCK_ITEM_ID,
            userId: 'user-1',
            qty: 1,
            reason: 'Defective or damaged item',
            customerNotes: 'Zipper is stuck',
            status: 'PENDING_INSPECTION',
            inspectionNotes: null,
            createdAt: new Date().toISOString(),
            itemTitle: 'Waterproof Rain Parka',
            itemSku: 'PARKA-BLU-L',
            itemUnitPriceCents: 2500,
          },
        ]),
      });
    });

    // 7. Mock seller inspect return decision
    await page.route(
      `**/api/v1/seller/stores/${MOCK_STORE_ID}/returns/${MOCK_RETURN_ID}/inspect`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: MOCK_RETURN_ID,
            orderId: MOCK_ORDER_ID,
            sellerOrderId: MOCK_SUBORDER_ID,
            storeId: MOCK_STORE_ID,
            orderItemId: MOCK_ITEM_ID,
            userId: 'user-1',
            qty: 1,
            reason: 'Defective or damaged item',
            customerNotes: 'Zipper is stuck',
            status: 'APPROVED',
            inspectionNotes: 'Physical defect verified. Restocked.',
            createdAt: new Date().toISOString(),
            itemTitle: 'Waterproof Rain Parka',
            itemSku: 'PARKA-BLU-L',
            itemUnitPriceCents: 2500,
          }),
        });
      },
    );

    // 8. Visit seller return queue console
    await page.goto(`/seller/${MOCK_STORE_ID}/returns`);

    // Verify seller table view
    await expect(page.getByRole('heading', { name: /Return Requests Queue/i })).toBeVisible();
    await expect(page.getByText('Waterproof Rain Parka')).toBeVisible();

    // Click "Inspect" button
    await page.getByRole('button', { name: 'Inspect' }).click();

    // Verify modal is visible
    await expect(page.getByRole('heading', { name: /Inspect Return Request/i })).toBeVisible();
    await expect(page.getByLabel(/Restock Item/i)).toBeChecked();

    // Add inspection notes and confirm
    await page.getByLabel(/Inspection notes/i).fill('Physical defect verified. Restocked.');
    await page.getByRole('button', { name: /Confirm Decision/i }).click();

    // Verify status updated to APPROVED
    await expect(page.getByText('APPROVED')).toBeVisible();
  });
});
