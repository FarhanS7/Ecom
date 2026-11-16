// Unit tests for ProductProjector (T030)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { projectProductEvent } from './projector.js';
import type { Queryable } from '../identity/auth.service.js';

describe('ProductProjector (T030)', () => {
  let mockTx: { unsafe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTx = {
      unsafe: vi.fn(),
    };
  });

  it('ignores duplicate event when receipt already exists', async () => {
    // 1. consumer_receipts insert returns 0 rows (conflict/duplicate)
    mockTx.unsafe.mockResolvedValueOnce([]);

    const outcome = await projectProductEvent(mockTx as unknown as Queryable, {
      id: '00000000-0000-0000-0000-000000000001',
      aggregateId: '00000000-0000-0000-0000-000000000002',
      aggregateVersion: 2,
      type: 'ProductChanged',
    });

    expect(outcome.status).toBe('DUPLICATE_IGNORED');
    expect(outcome.productId).toBe('00000000-0000-0000-0000-000000000002');
    // Only the receipt check was executed
    expect(mockTx.unsafe).toHaveBeenCalledTimes(1);
    expect(mockTx.unsafe.mock.calls[0][0]).toContain('consumer_receipts');
  });

  it('ignores stale version when existing document has higher or equal version', async () => {
    // 1. consumer_receipts insert returns newly inserted event_id
    mockTx.unsafe.mockResolvedValueOnce([{ event_id: '00000000-0000-0000-0000-000000000001' }]);
    // 2. existing search_documents check returns source_version = 5
    mockTx.unsafe.mockResolvedValueOnce([{ source_version: 5 }]);

    // Event with version 4 arrives (e.g. out of order after v5)
    const outcome = await projectProductEvent(mockTx as unknown as Queryable, {
      id: '00000000-0000-0000-0000-000000000001',
      aggregateId: '00000000-0000-0000-0000-000000000002',
      aggregateVersion: 4,
      type: 'ProductChanged',
    });

    expect(outcome.status).toBe('STALE_VERSION_IGNORED');
    expect(outcome.currentVersion).toBe(5);
    expect(outcome.version).toBe(4);
    // Does not attempt to update search_documents
    expect(mockTx.unsafe).toHaveBeenCalledTimes(2);
  });

  it('projects active product into search_documents with correct visibility and rating', async () => {
    // 1. consumer_receipts insert succeeds
    mockTx.unsafe.mockResolvedValueOnce([{ event_id: '00000000-0000-0000-0000-000000000001' }]);
    // 2. existing search_documents check returns source_version = 2
    mockTx.unsafe.mockResolvedValueOnce([{ source_version: 2 }]);
    // 3. canonical product query returns active product
    mockTx.unsafe.mockResolvedValueOnce([
      {
        id: '00000000-0000-0000-0000-000000000002',
        store_id: '00000000-0000-0000-0000-000000000003',
        version: 3,
        title: 'Running Shoes',
        description: 'Comfortable shoes',
        brand: 'ShopRun',
        category_id: '00000000-0000-0000-0000-000000000004',
        category_path: '/sports/shoes/',
        attributes: { size: '10' },
        min_price_cents: '5000',
        currency: 'usd',
        status: 'active',
        rating_sum: 9,
        rating_count: 2,
        sales_count: 10,
        marketplace_enabled: true,
        store_enabled: true,
      },
    ]);
    // 4. upsert into search_documents succeeds
    mockTx.unsafe.mockResolvedValueOnce([]);

    const outcome = await projectProductEvent(mockTx as unknown as Queryable, {
      id: '00000000-0000-0000-0000-000000000001',
      aggregateId: '00000000-0000-0000-0000-000000000002',
      aggregateVersion: 3,
      type: 'ProductChanged',
    });

    expect(outcome.status).toBe('PROJECTED');
    expect(outcome.version).toBe(3);

    // Verify the upsert params
    expect(mockTx.unsafe).toHaveBeenCalledTimes(4);
    const [upsertSql, upsertParams] = mockTx.unsafe.mock.calls[3];
    expect(upsertSql).toContain('INSERT INTO "search_documents"');
    expect(upsertParams[0]).toBe('00000000-0000-0000-0000-000000000002'); // product_id
    expect(upsertParams[2]).toBe(3); // source_version
    expect(upsertParams[3]).toBe('Running Shoes'); // title
    expect(upsertParams[13]).toBe(true); // visibility = active and enabled
    expect(upsertParams[15]).toBe('4.50'); // rating_avg = 9 / 2
  });

  it('marks visibility = false when product is draft or archived', async () => {
    mockTx.unsafe.mockResolvedValueOnce([{ event_id: 'evt-1' }]);
    mockTx.unsafe.mockResolvedValueOnce([]); // no existing document
    mockTx.unsafe.mockResolvedValueOnce([
      {
        id: '00000000-0000-0000-0000-000000000002',
        store_id: '00000000-0000-0000-0000-000000000003',
        version: 1,
        title: 'Draft Lamp',
        description: '',
        brand: null,
        category_id: null,
        category_path: '/',
        attributes: {},
        min_price_cents: '0',
        currency: 'usd',
        status: 'draft',
        rating_sum: 0,
        rating_count: 0,
        sales_count: 0,
        marketplace_enabled: false,
        store_enabled: false,
      },
    ]);
    mockTx.unsafe.mockResolvedValueOnce([]);

    const outcome = await projectProductEvent(mockTx as unknown as Queryable, {
      id: 'evt-1',
      aggregateId: '00000000-0000-0000-0000-000000000002',
      aggregateVersion: 1,
      type: 'ProductChanged',
    });

    expect(outcome.status).toBe('PROJECTED');
    const [, upsertParams] = mockTx.unsafe.mock.calls[3];
    expect(upsertParams[13]).toBe(false); // visibility must be false for draft
  });
});
