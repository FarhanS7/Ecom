// apps/web/src/app/seller/[storeId]/settings/page.test.tsx - Security regression tests for settings page (T068).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SellerSettingsPage from './page';
import * as load from '@/features/seller/load';
import { DEFAULT_THEME } from '@/components/theme';

describe('SellerSettingsPage Security Regression (T068)', () => {
  afterEach(cleanup);
  const storeId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(load, 'loadStoreTheme').mockResolvedValue({
      status: 'ok',
      data: DEFAULT_THEME,
    });
    vi.spyOn(load, 'loadStoreContent').mockResolvedValue({
      status: 'ok',
      data: {
        storeId,
        version: 1,
        headline: 'Welcome',
        featuredIds: [],
        socials: {},
        swatches: {},
      },
    });
    vi.spyOn(load, 'loadStoreTeam').mockResolvedValue({
      status: 'ok',
      data: {
        storeId,
        members: [],
        invitations: [],
      },
    });
  });

  it('asserts catalog-editor cannot access /seller/settings and receives Access Denied', async () => {
    vi.spyOn(load, 'loadMembership').mockResolvedValue({
      status: 'ok',
      data: {
        storeId,
        role: 'catalog-editor',
        status: 'active',
      },
    });

    const page = await SellerSettingsPage({ params: { storeId } });
    render(page);

    expect(screen.getByTestId('settings-access-denied')).toBeInTheDocument();
    expect(screen.getByText(/Store settings are restricted to store owners and managers/i)).toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace')).not.toBeInTheDocument();
  });

  it('asserts fulfillment role cannot access /seller/settings and receives Access Denied', async () => {
    vi.spyOn(load, 'loadMembership').mockResolvedValue({
      status: 'ok',
      data: {
        storeId,
        role: 'fulfillment',
        status: 'active',
      },
    });

    const page = await SellerSettingsPage({ params: { storeId } });
    render(page);

    expect(screen.getByTestId('settings-access-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace')).not.toBeInTheDocument();
  });

  it('allows owner access and renders the full settings workspace', async () => {
    vi.spyOn(load, 'loadMembership').mockResolvedValue({
      status: 'ok',
      data: {
        storeId,
        role: 'owner',
        status: 'active',
      },
    });

    const page = await SellerSettingsPage({ params: { storeId } });
    render(page);

    expect(screen.getByTestId('settings-workspace')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Theme Customizer/i })).toBeInTheDocument();
  });
});
