// packages/backend/src/reporting/analytics.service.test.ts - Unit tests for AnalyticsQueryService (AD-2, REQ-ENG-002 / T066).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { AnalyticsQueryService } from './analytics.service.js';

function createSql(mock: unknown): Sql {
  return mock as unknown as Sql;
}

describe('AnalyticsQueryService (T066 Unit Tests)', () => {
  const storeId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('refreshMaterializedViews', () => {
    it('executes concurrent refreshes on both materialized views', async () => {
      const mockSql = {
        unsafe: vi.fn().mockResolvedValue([]),
      };

      const service = new AnalyticsQueryService(createSql(mockSql));
      const result = await service.refreshMaterializedViews(true);

      expect(result.refreshed).toBe(true);
      expect(mockSql.unsafe).toHaveBeenCalledWith(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_daily_sales";',
      );
      expect(mockSql.unsafe).toHaveBeenCalledWith(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_store_performance";',
      );
    });

    it('falls back to non-concurrent refresh if concurrent refresh fails', async () => {
      const mockSql = {
        unsafe: vi
          .fn()
          .mockRejectedValueOnce(new Error('Cannot refresh concurrently'))
          .mockResolvedValue([]),
      };

      const service = new AnalyticsQueryService(createSql(mockSql));
      const result = await service.refreshMaterializedViews(true);

      expect(result.refreshed).toBe(true);
      expect(mockSql.unsafe).toHaveBeenCalledWith(
        'REFRESH MATERIALIZED VIEW "mv_daily_sales";',
      );
      expect(mockSql.unsafe).toHaveBeenCalledWith(
        'REFRESH MATERIALIZED VIEW "mv_store_performance";',
      );
    });
  });

  describe('getStoreAnalytics', () => {
    it('returns store sales summary with daily trends and store lifetime metrics', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM mv_daily_sales')) {
          return Promise.resolve([
            {
              day: '2026-11-15',
              orders_count: 5,
              units_sold: 8,
              gmv_cents: 25000,
              net_sales_cents: 23000,
              avg_order_value_cents: 5000,
            },
            {
              day: '2026-11-16',
              orders_count: 10,
              units_sold: 15,
              gmv_cents: 60000,
              net_sales_cents: 55000,
              avg_order_value_cents: 6000,
            },
          ]);
        }
        if (query.includes('FROM mv_store_performance')) {
          return Promise.resolve([
            {
              total_orders: 15,
              lifetime_gmv_cents: 85000,
              avg_order_value_cents: 5667,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const service = new AnalyticsQueryService(createSql(mockSql));
      const result = await service.getStoreAnalytics(storeId, {
        from: new Date('2026-11-01'),
        to: new Date('2026-11-30'),
      });

      expect(result.storeId).toBe(storeId);
      expect(result.totalOrders).toBe(15);
      expect(result.totalGmvCents).toBe(85000);
      expect(result.totalUnitsSold).toBe(23);
      expect(result.avgOrderValueCents).toBe(5667);
      expect(result.dailyTrends).toHaveLength(2);
      expect(result.dailyTrends[0]?.day).toBe('2026-11-15');
    });

    it('returns zero metrics when store has no recorded sales', async () => {
      const mockSql = vi.fn().mockImplementation(() => Promise.resolve([]));

      const service = new AnalyticsQueryService(createSql(mockSql));
      const result = await service.getStoreAnalytics(storeId);

      expect(result.storeId).toBe(storeId);
      expect(result.totalOrders).toBe(0);
      expect(result.totalGmvCents).toBe(0);
      expect(result.totalUnitsSold).toBe(0);
      expect(result.avgOrderValueCents).toBe(0);
      expect(result.dailyTrends).toEqual([]);
    });
  });

  describe('getPlatformAnalytics', () => {
    it('aggregates daily platform totals and ranks top stores', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM mv_daily_sales')) {
          return Promise.resolve([
            {
              day: '2026-11-16',
              orders_count: 50,
              units_sold: 100,
              gmv_cents: 500000,
              net_sales_cents: 480000,
              avg_order_value_cents: 10000,
            },
          ]);
        }
        if (query.includes('FROM mv_store_performance')) {
          return Promise.resolve([
            {
              store_id: storeId,
              store_name: 'Keyboards Co',
              store_slug: 'keyboards-co',
              total_orders: 30,
              lifetime_gmv_cents: 300000,
              avg_order_value_cents: 10000,
              last_order_at: new Date('2026-11-16T10:00:00Z'),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const service = new AnalyticsQueryService(createSql(mockSql));
      const result = await service.getPlatformAnalytics();

      expect(result.platformTotalOrders).toBe(50);
      expect(result.platformTotalGmvCents).toBe(500000);
      expect(result.platformAvgOrderValueCents).toBe(10000);
      expect(result.topStores).toHaveLength(1);
      expect(result.topStores[0]?.storeName).toBe('Keyboards Co');
      expect(result.dailyTrends).toHaveLength(1);
    });
  });
});
