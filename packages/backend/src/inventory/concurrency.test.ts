// @shopscale/backend/inventory/concurrency.test - Concurrency simulation tests (T044).
// Proves the atomic row-predicate locking logic under 500 concurrent callers without database dependency.

import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryService } from './inventory.service.js';
import type { Sql } from '../../src/platform/database.js';

describe('InventoryService Concurrency Contention Simulation (T044)', () => {
  let onHand = 50;
  let reserved = 0;
  let reservationsCount = 0;
  let deltaReservedSum = 0;

  // Thread-safe atomic lock simulation simulating PostgreSQL row-level mutex
  let isLocked = false;
  const lockQueue: Array<() => void> = [];

  function acquireLock(): Promise<void> {
    return new Promise((resolve) => {
      if (!isLocked) {
        isLocked = true;
        resolve();
      } else {
        lockQueue.push(resolve);
      }
    });
  }

  function releaseLock(): void {
    if (lockQueue.length > 0) {
      const next = lockQueue.shift();
      next?.();
    } else {
      isLocked = false;
    }
  }

  const mockSql = {
    unsafe: async (query: string, params: unknown[] = []) => {
      // 1. Savepoint operations
      if (query.startsWith('SAVEPOINT') || query.startsWith('RELEASE SAVEPOINT') || query.startsWith('ROLLBACK TO SAVEPOINT')) {
        return [];
      }

      // 2. Atomic UPDATE with row lock predicate: WHERE ("on_hand" - "reserved") >= $1
      if (query.includes('UPDATE "inventory"')) {
        await acquireLock();
        try {
          const qty = Number(params[0]);
          if (onHand - reserved >= qty) {
            reserved += qty;
            return [{ store_id: 'store-1', on_hand: onHand, reserved }];
          }
          return []; // 0 rows updated
        } finally {
          releaseLock();
        }
      }

      // 3. Current stock lookup
      if (query.includes('SELECT "on_hand", "reserved" FROM "inventory"')) {
        return [{ on_hand: onHand, reserved }];
      }

      // 4. Reservation insertion
      if (query.includes('INSERT INTO "stock_reservations"')) {
        reservationsCount++;
        return [{ id: `res-${reservationsCount}` }];
      }

      // 5. Stock movement ledger insertion
      if (query.includes('INSERT INTO "stock_movements"')) {
        const delta = Number(params[2]);
        deltaReservedSum += delta;
        return [{ id: `mov-${reservationsCount}` }];
      }

      return [];
    },
  } as unknown as Sql;

  beforeEach(() => {
    onHand = 50;
    reserved = 0;
    reservationsCount = 0;
    deltaReservedSum = 0;
    isLocked = false;
    lockQueue.length = 0;
  });

  it('500 concurrent callers competing for 50 units yield exactly 50 successes and 450 rejections (G2, IN-3)', async () => {
    const service = new InventoryService(mockSql);
    const variantId = 'var-flash-sale-50';
    const TOTAL_CALLERS = 500;

    const callers = Array.from({ length: TOTAL_CALLERS }, (_, idx) => {
      const checkoutId = `chk-concurrent-${idx}`;
      return service.reserve({
        checkoutId,
        items: [{ variantId, qty: 1 }],
      });
    });

    const results = await Promise.all(callers);

    const successes = results.filter((r) => r.ok === true);
    const rejections = results.filter((r) => r.ok === false);

    // Invariant 1: Exactly 50 reservations succeed
    expect(successes).toHaveLength(50);

    // Invariant 2: Exactly 450 reservations fail with INSUFFICIENT_STOCK
    expect(rejections).toHaveLength(450);
    for (const rej of rejections) {
      expect(rej.ok).toBe(false);
      if (!rej.ok) {
        expect(rej.code).toBe('INSUFFICIENT_STOCK');
        expect(rej.available).toBe(0);
      }
    }

    // Invariant 3: Final stock values
    expect(reserved).toBe(50);
    expect(onHand - reserved).toBe(0);

    // Invariant 4: Exactly 50 reservations inserted
    expect(reservationsCount).toBe(50);

    // Invariant 5: Movement ledger records sum(delta_reserved) = 50
    expect(deltaReservedSum).toBe(50);
  });
});
