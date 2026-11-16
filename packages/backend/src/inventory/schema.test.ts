// Unit tests for inventory schema and invariants (T037).
import { describe, expect, it } from 'vitest';
import {
  computeAvailableStock,
  InventoryConstraintError,
  inventory,
  stockReservations,
  stockMovements,
} from './schema.js';

describe('Inventory Schema & Invariants (T037)', () => {
  it('correctly computes available stock as max(0, on_hand - reserved)', () => {
    expect(computeAvailableStock(10, 3)).toBe(7);
    expect(computeAvailableStock(5, 5)).toBe(0);
    expect(computeAvailableStock(0, 0)).toBe(0);
    expect(computeAvailableStock(2, 5)).toBe(0); // Guard against negative
  });

  it('exposes correct Drizzle table definitions and constraints', () => {
    expect(inventory).toBeDefined();
    expect(stockReservations).toBeDefined();
    expect(stockMovements).toBeDefined();

    // Verify key columns exist
    expect(inventory.variantId).toBeDefined();
    expect(inventory.onHand).toBeDefined();
    expect(inventory.reserved).toBeDefined();

    expect(stockReservations.cartId).toBeDefined();
    expect(stockReservations.quantity).toBeDefined();
    expect(stockReservations.expiresAt).toBeDefined();

    expect(stockMovements.deltaOnHand).toBeDefined();
    expect(stockMovements.deltaReserved).toBeDefined();
    expect(stockMovements.operationKey).toBeDefined();
  });

  it('instantiates typed InventoryConstraintError', () => {
    const err = new InventoryConstraintError('CHECK constraint violated', '23514');
    expect(err.name).toBe('InventoryConstraintError');
    expect(err.code).toBe('23514');
    expect(err.message).toBe('CHECK constraint violated');
  });
});
