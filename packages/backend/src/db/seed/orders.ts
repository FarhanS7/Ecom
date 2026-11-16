// @shopscale/backend/db/seed/orders - T077 realistic order, inventory, and review fixtures.
// Invariants:
// 1. Zipfian power-law product sampling: top 1% of products receive >= 25% of all order items.
// 2. Vendor splitting (DEC-011): child seller_orders created per distinct vendor in an order.
// 3. Composite foreign key integrity: order_items strictly bound to (store_id, seller_order_id).
// 4. Zero negative monetary values and non-negative stock counts.
// 5. Deterministic generation using mulberry32 PRNG and name-based UUIDs.

import type { Sql } from 'postgres';
import { ZipfSampler, generateSeasonalOrderTimestamp } from './distributions.js';
import { insertChunked, type IdentityPlan, type SeedSize } from './identity.js';
import type { CatalogPlan, SeedVariantRow } from './catalog.js';
import { idFor, intBetween, isoAt, pick, seedRandom, weighted } from './random.js';

export interface SeedInventoryRow {
  variant_id: string;
  store_id: string;
  on_hand: number;
  reserved: number;
  updated_at: string;
}

export interface SeedOrderRow {
  id: string;
  user_id: string;
  channel_key: string;
  store_id: string | null;
  payment_status: string;
  fulfillment_status: string;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  currency: string;
  address_snapshot: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SeedSellerOrderRow {
  id: string;
  order_id: string;
  store_id: string;
  fulfillment_status: string;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  commission_bps_snapshot: number;
  created_at: string;
  updated_at: string;
}

export interface SeedOrderItemRow {
  id: string;
  order_id: string;
  seller_order_id: string;
  store_id: string;
  variant_id: string;
  title_snapshot: string;
  sku_snapshot: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
  discount_cents: number;
  created_at: string;
}

export interface SeedReviewRow {
  id: string;
  store_id: string;
  product_id: string;
  user_id: string;
  rating: number;
  title: string;
  comment: string;
  verified_purchase: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OrdersPlan {
  seed: number;
  size: SeedSize;
  inventory: SeedInventoryRow[];
  orders: SeedOrderRow[];
  sellerOrders: SeedSellerOrderRow[];
  orderItems: SeedOrderItemRow[];
  reviews: SeedReviewRow[];
}

export interface OrdersWriteReport {
  inventory: number;
  order: number;
  sellerOrder: number;
  orderItem: number;
  review: number;
}

export interface PlanOrdersInput {
  seed: number;
  size: SeedSize;
  identity: IdentityPlan;
  catalog: CatalogPlan;
  orderCount?: number;
}

const REVIEW_TITLES: readonly [string, number][] = [
  ['Great product, highly recommend!', 40],
  ['Solid build quality and fast shipping', 30],
  ['Good value for money', 15],
  ['Decent, but has minor flaws', 10],
  ['Did not meet expectations', 5],
];

const REVIEW_COMMENTS = [
  'Arrived on time and exactly as described in the catalog.',
  'Excellent build quality, performs very well for everyday use.',
  'Satisfied with the purchase, smooth checkout experience.',
  'Good packaging and reasonable delivery speed.',
  'Customer service answered my inquiries promptly.',
];

export function ordersCountForSize(size: SeedSize): number {
  switch (size) {
    case 's':
      return 100;
    case 'm':
      return 1000;
    case 'l':
      return 25_000;
    case 'xl':
      return 100_000;
  }
}

/**
 * Pure generator planning inventory, orders, seller suborders, order items, and reviews.
 */
export function planOrders(input: PlanOrdersInput): OrdersPlan {
  const rng = seedRandom(input.seed + 9999);
  const catalogProducts = input.catalog.products;
  const catalogVariants = input.catalog.variants;
  const customers = input.identity.users;

  // 1. Plan inventory for every variant
  const inventory: SeedInventoryRow[] = [];
  const variantMap = new Map<string, SeedVariantRow>();

  for (const variant of catalogVariants) {
    variantMap.set(variant.id, variant);
    inventory.push({
      variant_id: variant.id,
      store_id: variant.store_id,
      on_hand: intBetween(rng, 10, 250),
      reserved: 0,
      updated_at: isoAt(0),
    });
  }

  // Pre-sort active products for deterministic Zipfian rank assignment
  const activeProducts = catalogProducts.filter((p) => p.status === 'active');
  const nProducts = activeProducts.length;

  if (nProducts === 0 || customers.length === 0) {
    return {
      seed: input.seed,
      size: input.size,
      inventory,
      orders: [],
      sellerOrders: [],
      orderItems: [],
      reviews: [],
    };
  }

  const zipfSampler = new ZipfSampler(nProducts, 0.92);

  // Group variants by product
  const productVariantsMap = new Map<string, SeedVariantRow[]>();
  for (const variant of catalogVariants) {
    if (variant.status === 'active') {
      const list = productVariantsMap.get(variant.product_id) ?? [];
      list.push(variant);
      productVariantsMap.set(variant.product_id, list);
    }
  }

  const targetOrders = input.orderCount ?? ordersCountForSize(input.size);
  const orders: SeedOrderRow[] = [];
  const sellerOrders: SeedSellerOrderRow[] = [];
  const orderItems: SeedOrderItemRow[] = [];
  const reviews: SeedReviewRow[] = [];

  for (let orderIndex = 0; orderIndex < targetOrders; orderIndex += 1) {
    const orderId = idFor('order', input.seed, orderIndex);
    const customer = pick(rng, customers);
    const createdAtDate = generateSeasonalOrderTimestamp(rng);
    const createdAt = createdAtDate.toISOString();

    // 1 to 3 items per order
    const numItems = intBetween(rng, 1, 3);
    const orderItemsByStore = new Map<string, Array<{ variant: SeedVariantRow; qty: number; title: string }>>();

    for (let itemIndex = 0; itemIndex < numItems; itemIndex += 1) {
      const rank = zipfSampler.sample(rng);
      const product = activeProducts[rank]!;
      const availableVariants = productVariantsMap.get(product.id) ?? [];
      if (availableVariants.length === 0) continue;

      const variant = pick(rng, availableVariants);
      const qty = intBetween(rng, 1, 2);

      const storeItems = orderItemsByStore.get(product.store_id) ?? [];
      storeItems.push({ variant, qty, title: product.title });
      orderItemsByStore.set(product.store_id, storeItems);
    }

    if (orderItemsByStore.size === 0) continue;

    let orderSubtotalCents = 0;
    let orderShippingCents = 0;

    // Create child seller_orders per distinct vendor
    let storeIndex = 0;
    for (const [storeId, items] of orderItemsByStore.entries()) {
      const sellerOrderId = idFor('seller_order', input.seed, orderIndex, storeIndex);
      let sellerSubtotal = 0;

      for (let itemSubIndex = 0; itemSubIndex < items.length; itemSubIndex += 1) {
        const { variant, qty, title } = items[itemSubIndex]!;
        const itemTotal = qty * variant.price_cents;
        sellerSubtotal += itemTotal;

        orderItems.push({
          id: idFor('order_item', input.seed, orderIndex, storeIndex, itemSubIndex),
          order_id: orderId,
          seller_order_id: sellerOrderId,
          store_id: storeId,
          variant_id: variant.id,
          title_snapshot: title,
          sku_snapshot: variant.sku,
          qty,
          unit_price_cents: variant.price_cents,
          total_cents: itemTotal,
          discount_cents: 0,
          created_at: createdAt,
        });
      }

      const sellerShipping = 500; // $5.00 flat shipping per store
      sellerOrders.push({
        id: sellerOrderId,
        order_id: orderId,
        store_id: storeId,
        fulfillment_status: 'DELIVERED',
        subtotal_cents: sellerSubtotal,
        shipping_cents: sellerShipping,
        discount_cents: 0,
        total_cents: sellerSubtotal + sellerShipping,
        commission_bps_snapshot: 1000,
        created_at: createdAt,
        updated_at: createdAt,
      });

      orderSubtotalCents += sellerSubtotal;
      orderShippingCents += sellerShipping;
      storeIndex += 1;
    }

    const orderTotalCents = orderSubtotalCents + orderShippingCents;
    const addressSnapshot = JSON.stringify({
      fullName: 'Valued Customer',
      line1: '123 Market Street',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      country: 'US',
    });

    orders.push({
      id: orderId,
      user_id: customer.id,
      channel_key: 'marketplace',
      store_id: null,
      payment_status: 'PAID',
      fulfillment_status: 'DELIVERED',
      subtotal_cents: orderSubtotalCents,
      shipping_cents: orderShippingCents,
      discount_cents: 0,
      total_cents: orderTotalCents,
      currency: 'USD',
      address_snapshot: addressSnapshot,
      version: 1,
      created_at: createdAt,
      updated_at: createdAt,
    });

    // Optionally plan a review (~50% chance per order)
    if (rng() < 0.5 && orderItems.length > 0) {
      const reviewedItem = orderItems[orderItems.length - 1]!;
      const variant = variantMap.get(reviewedItem.variant_id);
      if (variant) {
        const rating = weighted(rng, [
          [5, 55],
          [4, 30],
          [3, 10],
          [2, 3],
          [1, 2],
        ]);
        const title = weighted(rng, REVIEW_TITLES);
        const comment = pick(rng, REVIEW_COMMENTS);
        const reviewDate = new Date(createdAtDate.getTime() + 86_400_000 * 3);

        reviews.push({
          id: idFor('review', input.seed, orderIndex),
          store_id: reviewedItem.store_id,
          product_id: variant.product_id,
          user_id: customer.id,
          rating,
          title,
          comment,
          verified_purchase: true,
          status: 'approved',
          created_at: reviewDate.toISOString(),
          updated_at: reviewDate.toISOString(),
        });
      }
    }
  }

  return {
    seed: input.seed,
    size: input.size,
    inventory,
    orders,
    sellerOrders,
    orderItems,
    reviews,
  };
}

/**
 * Writes planned inventory, orders, seller suborders, order items, and reviews to database.
 */
export async function writeOrders(sql: Sql, plan: OrdersPlan): Promise<OrdersWriteReport> {
  const inventoryCount = await insertChunked(sql, {
    table: 'inventory',
    columns: ['variant_id', 'store_id', 'on_hand', 'reserved', 'updated_at'],
    rows: plan.inventory,
    valuesOf: (row) => {
      const item = row as SeedInventoryRow;
      return [item.variant_id, item.store_id, item.on_hand, item.reserved, item.updated_at];
    },
  });

  const orderCount = await insertChunked(sql, {
    table: 'orders',
    columns: [
      'id',
      'user_id',
      'channel_key',
      'store_id',
      'payment_status',
      'fulfillment_status',
      'subtotal_cents',
      'shipping_cents',
      'discount_cents',
      'total_cents',
      'currency',
      'address_snapshot',
      'version',
      'created_at',
      'updated_at',
    ],
    casts: { address_snapshot: 'jsonb' },
    rows: plan.orders,
    valuesOf: (row) => {
      const item = row as SeedOrderRow;
      return [
        item.id,
        item.user_id,
        item.channel_key,
        item.store_id,
        item.payment_status,
        item.fulfillment_status,
        item.subtotal_cents,
        item.shipping_cents,
        item.discount_cents,
        item.total_cents,
        item.currency,
        item.address_snapshot,
        item.version,
        item.created_at,
        item.updated_at,
      ];
    },
  });

  const sellerOrderCount = await insertChunked(sql, {
    table: 'seller_orders',
    columns: [
      'id',
      'order_id',
      'store_id',
      'fulfillment_status',
      'subtotal_cents',
      'shipping_cents',
      'discount_cents',
      'total_cents',
      'commission_bps_snapshot',
      'created_at',
      'updated_at',
    ],
    rows: plan.sellerOrders,
    valuesOf: (row) => {
      const item = row as SeedSellerOrderRow;
      return [
        item.id,
        item.order_id,
        item.store_id,
        item.fulfillment_status,
        item.subtotal_cents,
        item.shipping_cents,
        item.discount_cents,
        item.total_cents,
        item.commission_bps_snapshot,
        item.created_at,
        item.updated_at,
      ];
    },
  });

  const orderItemCount = await insertChunked(sql, {
    table: 'order_items',
    columns: [
      'id',
      'order_id',
      'seller_order_id',
      'store_id',
      'variant_id',
      'title_snapshot',
      'sku_snapshot',
      'qty',
      'unit_price_cents',
      'total_cents',
      'discount_cents',
      'created_at',
    ],
    rows: plan.orderItems,
    valuesOf: (row) => {
      const item = row as SeedOrderItemRow;
      return [
        item.id,
        item.order_id,
        item.seller_order_id,
        item.store_id,
        item.variant_id,
        item.title_snapshot,
        item.sku_snapshot,
        item.qty,
        item.unit_price_cents,
        item.total_cents,
        item.discount_cents,
        item.created_at,
      ];
    },
  });

  const reviewCount = await insertChunked(sql, {
    table: 'reviews',
    columns: [
      'id',
      'store_id',
      'product_id',
      'user_id',
      'rating',
      'title',
      'comment',
      'verified_purchase',
      'status',
      'created_at',
      'updated_at',
    ],
    rows: plan.reviews,
    valuesOf: (row) => {
      const item = row as SeedReviewRow;
      return [
        item.id,
        item.store_id,
        item.product_id,
        item.user_id,
        item.rating,
        item.title,
        item.comment,
        item.verified_purchase,
        item.status,
        item.created_at,
        item.updated_at,
      ];
    },
  });

  return {
    inventory: inventoryCount,
    order: orderCount,
    sellerOrder: sellerOrderCount,
    orderItem: orderItemCount,
    review: reviewCount,
  };
}
