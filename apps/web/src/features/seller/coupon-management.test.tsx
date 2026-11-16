// @shopscale/web features/seller/coupon-management.test.tsx - Unit tests for CouponManagement (OR-9 / T063).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CouponDto } from '@shopscale/contracts';
import { CouponManagement } from './coupon-management';

const mockCoupons: CouponDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    storeId: 'store-1',
    code: 'SAVE10',
    kind: 'PERCENT',
    value: 10,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-12-31T23:59:59.000Z',
    globalLimit: 100,
    perUserLimit: 1,
    heldCount: 2,
    redeemedCount: 15,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('CouponManagement (T063)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders empty state when no coupons exist', () => {
    render(<CouponManagement storeId="store-1" initialCoupons={[]} />);

    expect(screen.getByTestId('coupons-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('coupon-management-table')).not.toBeInTheDocument();
  });

  it('renders table with existing coupons', () => {
    render(<CouponManagement storeId="store-1" initialCoupons={mockCoupons} />);

    expect(screen.getByTestId('coupon-management-table')).toBeInTheDocument();
    expect(screen.getByTestId('coupon-row-SAVE10')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('15 / 100')).toBeInTheDocument();
  });

  it('validates percentage value capped at 100%', async () => {
    render(<CouponManagement storeId="store-1" initialCoupons={mockCoupons} />);

    fireEvent.change(screen.getByTestId('input-new-coupon-code'), {
      target: { value: 'SUPERDEAL' },
    });
    fireEvent.change(screen.getByTestId('input-coupon-value'), {
      target: { value: '150' },
    });

    fireEvent.submit(screen.getByTestId('create-coupon-form'));

    await waitFor(() => {
      expect(screen.getByTestId('coupon-form-error')).toHaveTextContent(
        'Percentage coupon cannot exceed 100%',
      );
    });
  });

  it('submits new coupon via fetch and prepends to table', async () => {
    const newCoupon: CouponDto = {
      id: '22222222-2222-4222-8222-222222222222',
      storeId: 'store-1',
      code: 'WINTER25',
      kind: 'PERCENT',
      value: 25,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-12-31T23:59:59.000Z',
      globalLimit: 50,
      perUserLimit: 1,
      heldCount: 0,
      redeemedCount: 0,
      status: 'active',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => newCoupon,
    });

    render(<CouponManagement storeId="store-1" initialCoupons={mockCoupons} />);

    fireEvent.change(screen.getByTestId('input-new-coupon-code'), {
      target: { value: 'WINTER25' },
    });
    fireEvent.change(screen.getByTestId('input-coupon-value'), {
      target: { value: '25' },
    });

    fireEvent.click(screen.getByTestId('btn-create-coupon'));

    await waitFor(() => {
      expect(screen.getByTestId('coupon-success-alert')).toHaveTextContent(
        "Coupon 'WINTER25' created successfully",
      );
      expect(screen.getByTestId('coupon-row-WINTER25')).toBeInTheDocument();
    });
  });
});
