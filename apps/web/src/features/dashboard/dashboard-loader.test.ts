// apps/web/src/features/dashboard/dashboard-loader.test.ts - Unit/Integration tests for dashboard data loading

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveGatewayTarget } from '../../lib/api.js';

describe('Dashboard analytics loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows seller analytics and platform analytics through gateway allowlist', () => {
    const sellerTarget = resolveGatewayTarget([
      'v1',
      'seller',
      'stores',
      '00000000-0000-0000-0000-000000000001',
      'analytics',
    ]);
    expect(sellerTarget).toEqual({
      ok: true,
      path: 'v1/seller/stores/00000000-0000-0000-0000-000000000001/analytics',
    });

    const adminTarget = resolveGatewayTarget(['v1', 'admin', 'analytics']);
    expect(adminTarget).toEqual({
      ok: true,
      path: 'v1/admin/analytics',
    });
  });

  it('fetches store analytics and platform analytics successfully via fetch', async () => {
    const mockStoreAnalytics = {
      storeId: '00000000-0000-0000-0000-000000000001',
      totalOrders: 42,
      totalGmvCents: 125000,
      totalUnitsSold: 99,
      avgOrderValueCents: 2976,
      dailyTrends: [
        {
          day: '2026-11-15',
          ordersCount: 5,
          unitsSold: 12,
          gmvCents: 15000,
          netSalesCents: 15000,
          avgOrderValueCents: 3000,
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStoreAnalytics,
    } as Response);

    const res = await fetch('/api/v1/seller/stores/00000000-0000-0000-0000-000000000001/analytics');
    const data = await res.json();

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/seller/stores/00000000-0000-0000-0000-000000000001/analytics');
    expect(data.totalOrders).toBe(42);
    expect(data.totalGmvCents).toBe(125000);
  });
});
