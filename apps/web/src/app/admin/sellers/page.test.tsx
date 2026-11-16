// @shopscale/web app/admin/sellers/page.test - Security & regression tests for AdminSellersPage (T069).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AdminSellersPage from './page';
import * as sessionServer from '@/lib/session-server';
import * as adminLoad from '@/features/admin/load';

vi.mock('@/lib/session-server', () => ({
  currentSessionEmail: vi.fn(),
}));

vi.mock('@/features/admin/load', () => ({
  loadAdminStores: vi.fn(),
}));

describe('AdminSellersPage Security Gates (T069)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Access Restricted when non-admin actor loads the page (loadAdminStores returns null)', async () => {
    vi.mocked(sessionServer.currentSessionEmail).mockResolvedValueOnce('user@customer.dev');
    vi.mocked(adminLoad.loadAdminStores).mockResolvedValueOnce(null);

    const Page = await AdminSellersPage();
    render(Page);

    expect(screen.getByText('Access Restricted')).toBeDefined();
    expect(screen.getByText(/do not have administrative privileges/)).toBeDefined();
    expect(screen.queryByTestId('merchant-moderation')).toBeNull();
  });

  it('renders Merchant Moderation console when platform admin loads the page', async () => {
    vi.mocked(sessionServer.currentSessionEmail).mockResolvedValueOnce('admin@shopscale.dev');
    vi.mocked(adminLoad.loadAdminStores).mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        businessId: 'b1',
        slug: 'apex-athletics',
        name: 'Apex Athletics',
        status: 'pending',
        ownerEmail: 'seller@apex.com',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const Page = await AdminSellersPage();
    render(Page);

    expect(screen.getByText('Merchant Applications & Store Moderation')).toBeDefined();
    expect(screen.getByTestId('merchant-moderation')).toBeDefined();
    expect(screen.getByText('Apex Athletics')).toBeDefined();
  });
});
