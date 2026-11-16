// Unit tests for InventoryService.reserve() (T038).
// Invariants tested:
// 1. Ascending lock ordering: input items sorted by variantId ASC to prevent deadlocks.
// 2. Payload duplicate variant aggregation: quantities combined before query/lock execution.
// 3. Validation: rejects non-positive quantities and invalid inputs.
// 4. Result mapping: typed ReserveResult ({ ok: true } vs { ok: false, code: 'INSUFFICIENT_STOCK', available }).
// 5. Atomic rollback via savepoint: if one item fails, earlier reservations in batch are rolled back.

import { describe, expect, it, vi } from 'vitest';
import {
  aggregateAndSortItems,
  InventoryService,
  type ReserveInput,
} from './inventory.service.js';

describe('InventoryService.reserve (T038 Unit Tests)', () => {
  describe('aggregateAndSortItems helper', () => {
    it('aggregates duplicate variant IDs in input payload', () => {
      const items = [
        { variantId: 'b', qty: 2 },
        { variantId: 'a', qty: 1 },
        { variantId: 'b', qty: 3 },
      ];

      const aggregated = aggregateAndSortItems(items);

      expect(aggregated).toEqual([
        { variantId: 'a', qty: 1 },
        { variantId: 'b', qty: 5 },
      ]);
    });

    it('sorts variants in strictly ascending variantId order (deadlock prevention)', () => {
      const items = [
        { variantId: 'z-999', qty: 1 },
        { variantId: 'a-001', qty: 2 },
        { variantId: 'm-500', qty: 3 },
      ];

      const aggregated = aggregateAndSortItems(items);

      expect(aggregated.map((i) => i.variantId)).toEqual(['a-001', 'm-500', 'z-999']);
    });

    it('rejects items with non-positive or non-integer quantities', () => {
      expect(() => aggregateAndSortItems([{ variantId: 'a', qty: 0 }])).toThrow(
        /Quantity must be a positive integer/,
      );
      expect(() => aggregateAndSortItems([{ variantId: 'a', qty: -5 }])).toThrow(
        /Quantity must be a positive integer/,
      );
      expect(() => aggregateAndSortItems([{ variantId: 'a', qty: 1.5 }])).toThrow(
        /Quantity must be a positive integer/,
      );
    });

    it('handles empty items array', () => {
      expect(aggregateAndSortItems([])).toEqual([]);
    });
  });

  describe('InventoryService.reserve execution', () => {
    it('returns ok: true with reservation IDs when all items succeed', async () => {
      const executedQueries: string[] = [];
      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string, _params?: unknown[]) => {
          executedQueries.push(query);
          if (query.includes('SAVEPOINT')) {
            return Promise.resolve([]);
          }
          if (query.includes('UPDATE "inventory"')) {
            return Promise.resolve([
              {
                store_id: 'store-1',
                on_hand: 10,
                reserved: 5,
              },
            ]);
          }
          if (query.includes('INSERT INTO "stock_reservations"')) {
            return Promise.resolve([{ id: 'res-id-1' }]);
          }
          if (query.includes('INSERT INTO "stock_movements"')) {
            return Promise.resolve([{ id: 'mov-id-1' }]);
          }
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const input: ReserveInput = {
        checkoutId: 'cart-123',
        items: [
          { variantId: 'var-2', qty: 2 },
          { variantId: 'var-1', qty: 1 },
        ],
        ttlSeconds: 900,
      };

      const result = await service.reserve(mockTx, input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reservationIds).toEqual(['res-id-1', 'res-id-1']);
      }

      // Assert savepoint and lock ordering: var-1 updated before var-2
      const updateCalls = mockTx.unsafe.mock.calls.filter((c) =>
        String(c[0]).includes('UPDATE "inventory"'),
      );
      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[0][1][1]).toBe('var-1'); // variantId parameter
      expect(updateCalls[1][1][1]).toBe('var-2');
    });

    it('rolls back savepoint and returns typed INSUFFICIENT_STOCK when an item has inadequate stock', async () => {
      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string, params?: unknown[]) => {
          if (query.includes('SAVEPOINT')) {
            return Promise.resolve([]);
          }
          if (query.includes('UPDATE "inventory"')) {
            const variantId = params?.[1];
            if (variantId === 'var-1') {
              return Promise.resolve([{ store_id: 'store-1', on_hand: 10, reserved: 2 }]);
            }
            // var-2 fails conditional check (0 rows updated)
            return Promise.resolve([]);
          }
          if (query.includes('SELECT') && query.includes('"inventory"')) {
            // Checked stock after failure
            return Promise.resolve([{ on_hand: 5, reserved: 4 }]);
          }
          if (query.includes('INSERT INTO "stock_reservations"')) {
            return Promise.resolve([{ id: 'res-1' }]);
          }
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const input: ReserveInput = {
        checkoutId: 'cart-123',
        items: [
          { variantId: 'var-1', qty: 2 },
          { variantId: 'var-2', qty: 5 },
        ],
      };

      const result = await service.reserve(mockTx, input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INSUFFICIENT_STOCK');
        expect(result.variantId).toBe('var-2');
        expect(result.available).toBe(1); // 5 on_hand - 4 reserved = 1 available
      }

      // Assert rollback to savepoint was invoked
      const rollbackCall = mockTx.unsafe.mock.calls.find((c) =>
        String(c[0]).includes('ROLLBACK TO SAVEPOINT'),
      );
      expect(rollbackCall).toBeDefined();
    });

    it('returns available: 0 if variant does not exist in inventory table', async () => {
      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string) => {
          if (query.includes('UPDATE "inventory"')) return Promise.resolve([]);
          if (query.includes('SELECT') && query.includes('"inventory"')) return Promise.resolve([]);
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const input: ReserveInput = {
        checkoutId: 'cart-123',
        items: [{ variantId: 'var-missing', qty: 1 }],
      };

      const result = await service.reserve(mockTx, input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INSUFFICIENT_STOCK');
        expect(result.variantId).toBe('var-missing');
        expect(result.available).toBe(0);
      }
    });

    it('handles empty items without errors', async () => {
      const mockTx = {
        unsafe: vi.fn().mockResolvedValue([]),
      };

      const service = new InventoryService();
      const result = await service.reserve(mockTx, {
        checkoutId: 'cart-empty',
        items: [],
      });

      expect(result).toEqual({ ok: true, reservationIds: [] });
      expect(mockTx.unsafe).not.toHaveBeenCalled();
    });
  });
});
