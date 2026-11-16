// Unit tests for Stock Adjustments and Reservation Expiry Sweep (T039).
// Invariants tested:
// 1. Manual adjustment updates on_hand and appends stock_movements ledger.
// 2. Cannot reduce on_hand below currently active reserved count (throws CANNOT_REDUCE_BELOW_RESERVED).
// 3. Store isolation: foreign store or missing variant throws NOT_FOUND.
// 4. Release expired sweep claims expired active reservations, decrements reserved counter, and logs movement.

import { describe, expect, it, vi } from 'vitest';
import {
  InventoryService,
  type AdjustStockInput,
} from './inventory.service.js';

describe('InventoryService.adjustStock & Expiry Sweep (T039 Unit Tests)', () => {
  describe('adjustStock', () => {
    it('successfully increments on_hand on restocking and logs stock movement', async () => {
      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string, params?: unknown[]) => {
          if (query.includes('SELECT') && query.includes('"inventory"')) {
            return Promise.resolve([
              {
                store_id: 'store-1',
                variant_id: 'var-1',
                on_hand: 10,
                reserved: 3,
                version: 1,
              },
            ]);
          }
          if (query.includes('UPDATE "inventory"')) {
            const newOnHand = params?.[0] as number;
            return Promise.resolve([
              {
                store_id: 'store-1',
                variant_id: 'var-1',
                on_hand: newOnHand,
                reserved: 3,
                version: 2,
              },
            ]);
          }
          if (query.includes('INSERT INTO "stock_movements"')) {
            return Promise.resolve([{ id: 'mov-1' }]);
          }
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const input: AdjustStockInput = {
        storeId: 'store-1',
        variantId: 'var-1',
        deltaOnHand: 15,
        reason: 'manual_adjustment',
        operationKey: 'restock-001',
      };

      const result = await service.adjustStock(mockTx, input);

      expect(result.ok).toBe(true);
      expect(result.onHand).toBe(25);
      expect(result.reserved).toBe(3);
      expect(result.available).toBe(22);

      // Verify movement ledger call
      const movementCall = mockTx.unsafe.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO "stock_movements"'),
      );
      expect(movementCall).toBeDefined();
      expect(movementCall![1][2]).toBe(15); // deltaOnHand
      expect(movementCall![1][3]).toBe('manual_adjustment'); // reason
      expect(movementCall![1][4]).toBe('restock-001'); // operationKey
    });

    it('rejects adjustment that reduces on_hand below current reserved count with CANNOT_REDUCE_BELOW_RESERVED', async () => {
      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string) => {
          if (query.includes('SELECT') && query.includes('"inventory"')) {
            return Promise.resolve([
              {
                store_id: 'store-1',
                variant_id: 'var-1',
                on_hand: 10,
                reserved: 5,
                version: 1,
              },
            ]);
          }
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const input: AdjustStockInput = {
        storeId: 'store-1',
        variantId: 'var-1',
        deltaOnHand: -6, // 10 - 6 = 4, but reserved is 5!
        reason: 'manual_adjustment',
        operationKey: 'damage-001',
      };

      await expect(service.adjustStock(mockTx, input)).rejects.toThrow(
        expect.objectContaining({
          code: 'CANNOT_REDUCE_BELOW_RESERVED',
        }),
      );
    });

    it('rejects adjustment for variant belonging to another store (store isolation)', async () => {
      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string) => {
          if (query.includes('SELECT') && query.includes('"inventory"')) {
            // Row not found under this storeId
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const input: AdjustStockInput = {
        storeId: 'store-2', // Foreign store
        variantId: 'var-1',
        deltaOnHand: 5,
        reason: 'manual_adjustment',
        operationKey: 'cross-store-attempt',
      };

      await expect(service.adjustStock(mockTx, input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        }),
      );
    });
  });

  describe('releaseExpiredReservations', () => {
    it('claims expired active reservations, decrements reserved, and marks status expired', async () => {
      const expiredReservations = [
        {
          id: 'res-1',
          cart_id: 'cart-1',
          variant_id: 'var-1',
          store_id: 'store-1',
          quantity: 3,
        },
        {
          id: 'res-2',
          cart_id: 'cart-2',
          variant_id: 'var-2',
          store_id: 'store-1',
          quantity: 2,
        },
      ];

      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string) => {
          if (query.includes('FOR UPDATE SKIP LOCKED')) {
            return Promise.resolve(expiredReservations);
          }
          if (query.includes('UPDATE "stock_reservations"')) {
            return Promise.resolve([{ id: 'res-updated' }]);
          }
          if (query.includes('UPDATE "inventory"')) {
            return Promise.resolve([{ on_hand: 10, reserved: 0 }]);
          }
          if (query.includes('INSERT INTO "stock_movements"')) {
            return Promise.resolve([{ id: 'mov-1' }]);
          }
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const sweep = await service.releaseExpiredReservations(100, mockTx);

      expect(sweep.releasedCount).toBe(2);
      expect(sweep.releasedUnits).toBe(5);

      // Verify stock_reservations marked expired
      const statusUpdateCalls = mockTx.unsafe.mock.calls.filter((c) =>
        String(c[0]).includes('UPDATE "stock_reservations"'),
      );
      expect(statusUpdateCalls).toHaveLength(2);

      // Verify inventory.reserved decremented
      const invDecrementCalls = mockTx.unsafe.mock.calls.filter((c) =>
        String(c[0]).includes('UPDATE "inventory"'),
      );
      expect(invDecrementCalls).toHaveLength(2);
    });

    it('returns releasedCount 0 when no expired reservations exist', async () => {
      const mockTx = {
        unsafe: vi.fn().mockImplementation((query: string) => {
          if (query.includes('FOR UPDATE SKIP LOCKED')) {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        }),
      };

      const service = new InventoryService();
      const sweep = await service.releaseExpiredReservations(100, mockTx);

      expect(sweep.releasedCount).toBe(0);
      expect(sweep.releasedUnits).toBe(0);
    });
  });
});
