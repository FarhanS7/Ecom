// @shopscale/web features/support/refund-modal.test - Unit tests for SupportRefundModal (T069).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupportRefundModal } from './refund-modal';
import * as actions from './actions';

vi.mock('./actions', () => ({
  issueSupportRefundAction: vi.fn(),
}));

describe('SupportRefundModal (T069)', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal when open with initial defaults', () => {
    render(<SupportRefundModal orderId={orderId} isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Issue Support Refund')).toBeDefined();
    expect(screen.getByTestId('refund-amount-input')).toBeDefined();
    expect(screen.getByTestId('refund-reason-input')).toBeDefined();
    expect(screen.getByTestId('submit-refund-button')).toBeDefined();
  });

  it('enforces support policy cap: blocks submitting refund > $200.00', async () => {
    render(<SupportRefundModal orderId={orderId} isOpen={true} onClose={vi.fn()} />);

    const amountInput = screen.getByTestId('refund-amount-input');
    const reasonInput = screen.getByTestId('refund-reason-input');
    const submitBtn = screen.getByTestId('submit-refund-button');

    fireEvent.change(amountInput, { target: { value: '250.00' } });
    fireEvent.change(reasonInput, { target: { value: 'Customer complaint about delayed package' } });

    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/Support policy limit is \$200\.00/),
    ).toBeDefined();
    expect(actions.issueSupportRefundAction).not.toHaveBeenCalled();
  });

  it('enforces mandatory reason: blocks submitting with short reason', async () => {
    render(<SupportRefundModal orderId={orderId} isOpen={true} onClose={vi.fn()} />);

    const amountInput = screen.getByTestId('refund-amount-input');
    const reasonInput = screen.getByTestId('refund-reason-input');
    const submitBtn = screen.getByTestId('submit-refund-button');

    fireEvent.change(amountInput, { target: { value: '50.00' } });
    fireEvent.change(reasonInput, { target: { value: 'ok' } }); // < 3 chars

    fireEvent.click(submitBtn);

    expect(screen.getByText(/A reason with at least 3 characters is required/)).toBeDefined();
    expect(actions.issueSupportRefundAction).not.toHaveBeenCalled();
  });

  it('submits valid refund within $200 cap and displays success banner', async () => {
    vi.mocked(actions.issueSupportRefundAction).mockResolvedValueOnce({
      success: true,
      refundId: '22222222-2222-4222-8222-222222222222',
      message: 'Refund issued successfully.',
    });

    render(<SupportRefundModal orderId={orderId} isOpen={true} onClose={vi.fn()} />);

    const amountInput = screen.getByTestId('refund-amount-input');
    const reasonInput = screen.getByTestId('refund-reason-input');
    const submitBtn = screen.getByTestId('submit-refund-button');

    fireEvent.change(amountInput, { target: { value: '75.50' } });
    fireEvent.change(reasonInput, { target: { value: 'Item arrived with minor cosmetic blemish' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(actions.issueSupportRefundAction).toHaveBeenCalledWith({
        orderId,
        amountCents: 7550,
        reason: 'Item arrived with minor cosmetic blemish',
      });
      expect(screen.getByTestId('refund-success-banner')).toBeDefined();
    });
  });

  it('handles server POLICY_LIMIT_EXCEEDED error and displays error banner', async () => {
    vi.mocked(actions.issueSupportRefundAction).mockResolvedValueOnce({
      success: false,
      message: 'POLICY_LIMIT_EXCEEDED: Support refunds are capped at $200.00 per order.',
    });

    render(<SupportRefundModal orderId={orderId} isOpen={true} onClose={vi.fn()} />);

    const reasonInput = screen.getByTestId('refund-reason-input');
    const submitBtn = screen.getByTestId('submit-refund-button');

    fireEvent.change(reasonInput, { target: { value: 'Attempting cumulative refund exceeding cap' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('refund-error-banner')).toBeDefined();
      expect(screen.getByText(/POLICY_LIMIT_EXCEEDED/)).toBeDefined();
    });
  });
});
