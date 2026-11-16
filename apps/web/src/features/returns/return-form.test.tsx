// apps/web/src/features/returns/return-form.test.tsx - Unit tests for ReturnForm (T059).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CustomerOrderDetailDto, ReturnRequestDto } from '@shopscale/contracts';
import { ReturnForm } from './return-form';
import * as actions from './actions';

describe('ReturnForm (T059)', () => {
  afterEach(cleanup);

  const mockUserId = '11111111-1111-4111-8111-111111111111';

  const mockDeliveredOrder: CustomerOrderDetailDto = {
    id: '33333333-3333-4333-8333-333333333333',
    channelKey: 'marketplace',
    storeId: null,
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
      fullName: 'Alice Smith',
      line1: '123 Market St',
      line2: null,
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      country: 'USA',
      phone: null,
    },
    suborders: [],
    items: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        orderId: '33333333-3333-4333-8333-333333333333',
        sellerOrderId: '55555555-5555-4555-8555-555555555555',
        storeId: '22222222-2222-4222-8222-222222222222',
        variantId: '66666666-6666-4666-8666-666666666666',
        title: 'Organic Cotton Tee',
        sku: 'TEE-ORG-M',
        qty: 3,
        unitPriceCents: 2500,
        discountCents: 0,
        totalCents: 7500,
      },
    ],
  };

  const mockPendingOrder: CustomerOrderDetailDto = {
    ...mockDeliveredOrder,
    fulfillmentStatus: 'SHIPPED',
  };

  it('renders warning alert and does not show form when order is not DELIVERED', () => {
    render(<ReturnForm order={mockPendingOrder} existingReturns={[]} />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Order not yet delivered/i)).toBeDefined();
    expect(screen.queryByText(/Start a Return/i)).toBeNull();
  });

  it('renders return form with item options and default presets when order is DELIVERED', () => {
    render(<ReturnForm order={mockDeliveredOrder} existingReturns={[]} />);

    expect(screen.getByText(/Start a Return/i)).toBeDefined();
    expect(screen.getByLabelText(/Item to return/i)).toBeDefined();
    expect(screen.getByLabelText(/Quantity/i)).toBeDefined();
    expect(screen.getByLabelText(/Reason for return/i)).toBeDefined();
    expect(screen.getByLabelText(/Customer notes/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Submit Return Request/i })).toBeDefined();
  });

  it('displays existing return requests with appropriate tags', () => {
    const existingReturns: ReturnRequestDto[] = [
      {
        id: '77777777-7777-4777-8777-777777777777',
        orderId: mockDeliveredOrder.id,
        sellerOrderId: '55555555-5555-4555-8555-555555555555',
        storeId: '22222222-2222-4222-8222-222222222222',
        orderItemId: '44444444-4444-4444-8444-444444444444',
        userId: mockUserId,
        qty: 1,
        reason: 'Defective or damaged item',
        customerNotes: 'Small hole in sleeve',
        status: 'PENDING_INSPECTION',
        inspectionNotes: null,
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ReturnForm order={mockDeliveredOrder} existingReturns={existingReturns} />);

    expect(screen.getByText(/Submitted Return Requests/i)).toBeDefined();
    expect(screen.getByText(/Small hole in sleeve/i)).toBeDefined();
    expect(screen.getByText(/PENDING INSPECTION/i)).toBeDefined();
  });

  it('shows message when all items in the order have already been returned', () => {
    const allReturned: ReturnRequestDto[] = [
      {
        id: '77777777-7777-4777-8777-777777777777',
        orderId: mockDeliveredOrder.id,
        sellerOrderId: '55555555-5555-4555-8555-555555555555',
        storeId: '22222222-2222-4222-8222-222222222222',
        orderItemId: '44444444-4444-4444-8444-444444444444',
        userId: mockUserId,
        qty: 3, // All 3 units already returned
        reason: 'Wrong item sent',
        customerNotes: null,
        status: 'APPROVED',
        inspectionNotes: 'All good',
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ReturnForm order={mockDeliveredOrder} existingReturns={allReturned} />);

    expect(
      screen.getByText(/All eligible items in this order already have active or approved return requests/i),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: /Submit Return Request/i })).toBeNull();
  });

  it('validates quantity exceeding remaining returnable units', async () => {
    // 1 item already returned out of 3, remaining = 2
    const existingReturns: ReturnRequestDto[] = [
      {
        id: '77777777-7777-4777-8777-777777777777',
        orderId: mockDeliveredOrder.id,
        sellerOrderId: '55555555-5555-4555-8555-555555555555',
        storeId: '22222222-2222-4222-8222-222222222222',
        orderItemId: '44444444-4444-4444-8444-444444444444',
        userId: mockUserId,
        qty: 1,
        reason: 'Defective item',
        customerNotes: null,
        status: 'PENDING_INSPECTION',
        inspectionNotes: null,
        createdAt: new Date().toISOString(),
      },
    ];

    render(<ReturnForm order={mockDeliveredOrder} existingReturns={existingReturns} />);

    const qtyInput = screen.getByLabelText(/Quantity/i);
    fireEvent.change(qtyInput, { target: { value: '5' } });

    const submitBtn = screen.getByRole('button', { name: /Submit Return Request/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Cannot return more than 2 unit\(s\) for this item/i)).toBeDefined();
  });

  it('submits return request successfully and updates list', async () => {
    const createSpy = vi.spyOn(actions, 'createReturnRequestAction').mockResolvedValueOnce({
      ok: true,
      data: {
        id: '99999999-9999-4999-8999-999999999999',
        orderId: mockDeliveredOrder.id,
        sellerOrderId: '55555555-5555-4555-8555-555555555555',
        storeId: '22222222-2222-4222-8222-222222222222',
        orderItemId: '44444444-4444-4444-8444-444444444444',
        userId: mockUserId,
        qty: 1,
        reason: 'Defective or damaged item',
        customerNotes: 'Defective seams',
        status: 'PENDING_INSPECTION',
        inspectionNotes: null,
        createdAt: new Date().toISOString(),
      },
    });

    render(<ReturnForm order={mockDeliveredOrder} existingReturns={[]} />);

    const notesInput = screen.getByLabelText(/Customer notes/i);
    fireEvent.change(notesInput, { target: { value: 'Defective seams' } });

    const submitBtn = screen.getByRole('button', { name: /Submit Return Request/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Return request for 1 item\(s\) submitted successfully/i)).toBeDefined();
    expect(createSpy).toHaveBeenCalledWith(
      mockDeliveredOrder.id,
      expect.objectContaining({
        orderItemId: '44444444-4444-4444-8444-444444444444',
        qty: 1,
        reason: 'Defective or damaged item',
        customerNotes: 'Defective seams',
      }),
    );
  });
});
