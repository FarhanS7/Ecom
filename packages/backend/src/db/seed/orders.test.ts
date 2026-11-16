// packages/backend/src/db/seed/orders.test.ts - Unit tests for planned orders & distribution skew (TASK-077).
import { describe, expect, it } from 'vitest';
import { planCatalog } from './catalog.js';
import { planIdentity, shapeForSize } from './identity.js';
import { planOrders } from './orders.js';

describe('Seed Orders & Power-Law Distribution (TASK-077 Unit Tests)', () => {
  const seed = 42;
  const shape = shapeForSize('s');
  const identity = planIdentity({ seed, shape });
  const catalog = planCatalog(identity);

  it('generates deterministic orders plan given same seed', () => {
    const plan1 = planOrders({ seed, size: 's', identity, catalog, orderCount: 50 });
    const plan2 = planOrders({ seed, size: 's', identity, catalog, orderCount: 50 });

    expect(plan1.orders).toHaveLength(50);
    expect(plan1.orders).toEqual(plan2.orders);
    expect(plan1.sellerOrders).toEqual(plan2.sellerOrders);
    expect(plan1.orderItems).toEqual(plan2.orderItems);
    expect(plan1.inventory).toEqual(plan2.inventory);
    expect(plan1.reviews).toEqual(plan2.reviews);
  });

  it('guarantees referential integrity across orders, seller suborders, items, and catalog', () => {
    const plan = planOrders({ seed, size: 's', identity, catalog, orderCount: 100 });

    const orderIdSet = new Set(plan.orders.map((o) => o.id));
    const sellerOrderIdSet = new Set(plan.sellerOrders.map((so) => so.id));
    const catalogVariantIdSet = new Set(catalog.variants.map((v) => v.id));
    const catalogProductIdSet = new Set(catalog.products.map((p) => p.id));
    const userIdSet = new Set(identity.users.map((u) => u.id));

    // Every seller_order must point to a valid order and store
    for (const so of plan.sellerOrders) {
      expect(orderIdSet.has(so.order_id)).toBe(true);
      expect(so.subtotal_cents).toBeGreaterThan(0);
      expect(so.total_cents).toBe(so.subtotal_cents + so.shipping_cents);
    }

    // Every order_item must point to a valid order, seller_order, and catalog variant
    for (const item of plan.orderItems) {
      expect(orderIdSet.has(item.order_id)).toBe(true);
      expect(sellerOrderIdSet.has(item.seller_order_id)).toBe(true);
      expect(catalogVariantIdSet.has(item.variant_id)).toBe(true);
      expect(item.qty).toBeGreaterThan(0);
      expect(item.total_cents).toBe(item.qty * item.unit_price_cents);
    }

    // Every review must point to a valid product and user
    for (const review of plan.reviews) {
      expect(catalogProductIdSet.has(review.product_id)).toBe(true);
      expect(userIdSet.has(review.user_id)).toBe(true);
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
    }

    // Inventory planned for every catalog variant
    expect(plan.inventory).toHaveLength(catalog.variants.length);
  });

  it('verifies top 1% of products account for >= 25% of ordered items (PRD G1)', () => {
    // Generate 2,000 orders to empirically verify the Zipfian skew
    const plan = planOrders({ seed, size: 's', identity, catalog, orderCount: 2000 });

    const variantToProduct = new Map(catalog.variants.map((v) => [v.id, v.product_id]));
    const productItemCounts = new Map<string, number>();

    for (const item of plan.orderItems) {
      const productId = variantToProduct.get(item.variant_id)!;
      productItemCounts.set(productId, (productItemCounts.get(productId) ?? 0) + item.qty);
    }

    const sortedCounts = Array.from(productItemCounts.values()).sort((a, b) => b - a);
    const totalOrderedQty = sortedCounts.reduce((sum, c) => sum + c, 0);

    const activeProductsCount = catalog.products.filter((p) => p.status === 'active').length;
    // Top 1% of active products
    const top1PercentCount = Math.max(1, Math.floor(activeProductsCount * 0.01));

    let top1PercentOrderedQty = 0;
    for (let i = 0; i < top1PercentCount; i += 1) {
      top1PercentOrderedQty += sortedCounts[i] ?? 0;
    }

    const top1PercentFraction = top1PercentOrderedQty / totalOrderedQty;

    // Requirement: Top 1% accounts for >= 25% of orders
    expect(top1PercentFraction).toBeGreaterThanOrEqual(0.25);
  });
});
