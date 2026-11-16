// @shopscale/web features/checkout/coupon-input.test.tsx - Unit tests for CouponInput (OR-9 / T063).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CouponInput } from './coupon-input';

describe('CouponInput (T063)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders input field and apply button when no coupon applied', () => {
    const onApply = vi.fn().mockResolvedValue({ ok: true });
    render(<CouponInput onApply={onApply} />);

    expect(screen.getByTestId('input-coupon')).toBeInTheDocument();
    expect(screen.getByTestId('apply-coupon-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('applied-coupon-badge')).not.toBeInTheDocument();
  });

  it('submits upper-cased coupon code when form is submitted', async () => {
    const onApply = vi.fn().mockResolvedValue({ ok: true });
    render(<CouponInput onApply={onApply} />);

    const input = screen.getByTestId('input-coupon');
    fireEvent.change(input, { target: { value: 'save20' } });

    const btn = screen.getByTestId('apply-coupon-btn');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith('SAVE20');
    });
  });

  it('displays error message when onApply returns an error', async () => {
    const onApply = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Coupon is expired',
    });
    render(<CouponInput onApply={onApply} />);

    const input = screen.getByTestId('input-coupon');
    fireEvent.change(input, { target: { value: 'EXPIRED10' } });
    fireEvent.click(screen.getByTestId('apply-coupon-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('coupon-error')).toHaveTextContent('Coupon is expired');
    });
  });

  it('renders applied coupon badge with formatted discount amount', () => {
    const onApply = vi.fn();
    const onRemove = vi.fn();

    render(
      <CouponInput
        appliedCoupon="SAVE10"
        discountCents={1000}
        currency="USD"
        onApply={onApply}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByTestId('applied-coupon-badge')).toBeInTheDocument();
    expect(screen.getByText(/SAVE10/)).toBeInTheDocument();
    expect(screen.getByTestId('coupon-discount-text')).toHaveTextContent('-$10.00');
    expect(screen.queryByTestId('input-coupon')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const onApply = vi.fn();
    const onRemove = vi.fn();

    render(
      <CouponInput
        appliedCoupon="SAVE10"
        discountCents={1000}
        onApply={onApply}
        onRemove={onRemove}
      />,
    );

    const removeBtn = screen.getByTestId('remove-coupon-btn');
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
