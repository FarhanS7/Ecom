// Unit tests for ReindexService (T034)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReindexService } from './reindex.service.js';
import type { SqlClient } from '../platform/index.js';

describe('ReindexService (T034)', () => {
  let mockSql: {
    unsafe: ReturnType<typeof vi.fn>;
    begin: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSql = {
      unsafe: vi.fn(),
      begin: vi.fn().mockImplementation(async (callback) => {
        const fakeTx = { unsafe: vi.fn().mockResolvedValue([]) };
        return callback(fakeTx);
      }),
    };
  });

  it('processes products in bounded keyset batches', async () => {
    // 1st call: count products
    mockSql.unsafe.mockResolvedValueOnce([{ count: 3 }]);

    // 2nd call: batch 1 (2 products)
    mockSql.unsafe.mockResolvedValueOnce([
      {
        id: 'prod-001',
        store_id: 'store-1',
        version: 1,
        title: 'Running Shoes',
        description: 'Comfortable shoes',
        brand: 'Nike',
        category_id: null,
        category_path: '/shoes',
        attributes: {},
        min_price_cents: 9999,
        currency: 'USD',
        status: 'active',
        rating_sum: 10,
        rating_count: 2,
        sales_count: 5,
        marketplace_enabled: true,
        store_enabled: true,
      },
      {
        id: 'prod-002',
        store_id: 'store-1',
        version: 2,
        title: 'Trail Shoes',
        description: 'All-terrain',
        brand: 'Nike',
        category_id: null,
        category_path: '/shoes',
        attributes: {},
        min_price_cents: 12999,
        currency: 'USD',
        status: 'active',
        rating_sum: 0,
        rating_count: 0,
        sales_count: 0,
        marketplace_enabled: true,
        store_enabled: false,
      },
    ]);

    // 3rd call: batch 2 (1 product)
    mockSql.unsafe.mockResolvedValueOnce([
      {
        id: 'prod-003',
        store_id: 'store-1',
        version: 1,
        title: 'Road Shoes',
        description: 'Fast shoes',
        brand: 'Nike',
        category_id: null,
        category_path: '/shoes',
        attributes: {},
        min_price_cents: 8999,
        currency: 'USD',
        status: 'draft',
        rating_sum: 0,
        rating_count: 0,
        sales_count: 0,
        marketplace_enabled: false,
        store_enabled: false,
      },
    ]);

    // 4th call: batch 3 (empty -> finish)
    mockSql.unsafe.mockResolvedValueOnce([]);

    const progressUpdates: Array<{ processed: number; total: number; batchCount: number }> = [];
    const service = new ReindexService(mockSql as unknown as SqlClient);

    const result = await service.reindex({
      batchSize: 2,
      onProgress: (p) => progressUpdates.push(p),
    });

    expect(result.totalProducts).toBe(3);
    expect(result.reindexedCount).toBe(3);
    expect(result.batches).toBe(2);
    expect(progressUpdates.length).toBe(2);
    expect(progressUpdates[0]).toEqual({ processed: 2, total: 3, batchCount: 1 });
    expect(progressUpdates[1]).toEqual({ processed: 3, total: 3, batchCount: 2 });
    expect(mockSql.begin).toHaveBeenCalledTimes(2);
  });

  it('supports store-scoped reindexing', async () => {
    // 1st call: count store products
    mockSql.unsafe.mockResolvedValueOnce([{ count: 1 }]);

    // 2nd call: batch 1
    mockSql.unsafe.mockResolvedValueOnce([
      {
        id: 'prod-store-1',
        store_id: 'store-alpha',
        version: 1,
        title: 'Store Product',
        description: 'Scoped product',
        brand: 'Alpha',
        category_id: null,
        category_path: '/',
        attributes: {},
        min_price_cents: 2999,
        currency: 'USD',
        status: 'active',
        rating_sum: 5,
        rating_count: 1,
        sales_count: 1,
        marketplace_enabled: false,
        store_enabled: true,
      },
    ]);

    // 3rd call: batch 2 (empty)
    mockSql.unsafe.mockResolvedValueOnce([]);

    const service = new ReindexService(mockSql as unknown as SqlClient);
    const result = await service.reindex({
      storeSlug: 'alpha-store',
    });

    expect(result.totalProducts).toBe(1);
    expect(result.reindexedCount).toBe(1);
    expect(result.batches).toBe(1);

    // Verify SQL query had store filter
    const countQuery = mockSql.unsafe.mock.calls[0]![0] as string;
    expect(countQuery).toContain('JOIN "stores" s ON s."id" = p."store_id"');
  });

  it('handles empty database gracefully', async () => {
    mockSql.unsafe.mockResolvedValueOnce([{ count: 0 }]);
    mockSql.unsafe.mockResolvedValueOnce([]);

    const service = new ReindexService(mockSql as unknown as SqlClient);
    const result = await service.reindex();

    expect(result.totalProducts).toBe(0);
    expect(result.reindexedCount).toBe(0);
    expect(result.batches).toBe(0);
    expect(mockSql.begin).not.toHaveBeenCalled();
  });
});
