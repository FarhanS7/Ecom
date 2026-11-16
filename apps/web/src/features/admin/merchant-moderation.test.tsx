// @shopscale/web features/admin/merchant-moderation.test - Unit tests for MerchantModeration (T069).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AdminSellerSummaryDto } from '@shopscale/contracts';
import { MerchantModeration } from './merchant-moderation';
import * as actions from './actions';

vi.mock('./actions', () => ({
  approveStoreAction: vi.fn(),
  suspendStoreAction: vi.fn(),
}));

describe('MerchantModeration (T069)', () => {
  const mockStores: AdminSellerSummaryDto[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      businessId: 'b1',
      slug: 'apex-athletics',
      name: 'Apex Athletics',
      status: 'pending',
      ownerEmail: 'seller@apex.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      businessId: 'b2',
      slug: 'summit-gear',
      name: 'Summit Gear',
      status: 'active',
      ownerEmail: 'seller@summit.com',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders store moderation table with correct status counts and badges', () => {
    render(<MerchantModeration initialStores={mockStores} />);

    expect(screen.getByTestId('metric-pending').textContent).toBe('1');
    expect(screen.getByTestId('metric-active').textContent).toBe('1');
    expect(screen.getByText('Apex Athletics')).toBeDefined();
    expect(screen.getByText('Summit Gear')).toBeDefined();
    expect(screen.getByTestId('status-badge-11111111-1111-4111-8111-111111111111').textContent).toBe('pending');
    expect(screen.getByTestId('status-badge-22222222-2222-4222-8222-222222222222').textContent).toBe('active');
  });

  it('filters stores by status tab', () => {
    render(<MerchantModeration initialStores={mockStores} />);

    // Click pending filter tab
    fireEvent.click(screen.getByTestId('tab-filter-pending'));

    expect(screen.getByText('Apex Athletics')).toBeDefined();
    expect(screen.queryByText('Summit Gear')).toBeNull();

    // Click active filter tab
    fireEvent.click(screen.getByTestId('tab-filter-active'));

    expect(screen.queryByText('Apex Athletics')).toBeNull();
    expect(screen.getByText('Summit Gear')).toBeDefined();
  });

  it('approves a pending store application on button click', async () => {
    vi.mocked(actions.approveStoreAction).mockResolvedValueOnce({
      success: true,
      message: 'Store approved successfully.',
    });

    render(<MerchantModeration initialStores={mockStores} />);

    const approveBtn = screen.getByTestId('approve-btn-11111111-1111-4111-8111-111111111111');
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(actions.approveStoreAction).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
      expect(screen.getByTestId('admin-banner')).toBeDefined();
      expect(screen.getByText(/has been successfully approved/)).toBeDefined();
      expect(screen.getByTestId('status-badge-11111111-1111-4111-8111-111111111111').textContent).toBe('active');
    });
  });

  it('suspends an active merchant on button click', async () => {
    vi.mocked(actions.suspendStoreAction).mockResolvedValueOnce({
      success: true,
      message: 'Store suspended successfully.',
    });

    render(<MerchantModeration initialStores={mockStores} />);

    const suspendBtn = screen.getByTestId('suspend-btn-22222222-2222-4222-8222-222222222222');
    fireEvent.click(suspendBtn);

    await waitFor(() => {
      expect(actions.suspendStoreAction).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
      expect(screen.getByTestId('admin-banner')).toBeDefined();
      expect(screen.getByText(/has been suspended/)).toBeDefined();
      expect(screen.getByTestId('status-badge-22222222-2222-4222-8222-222222222222').textContent).toBe('suspended');
    });
  });
});
