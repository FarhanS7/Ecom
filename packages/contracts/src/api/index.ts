// @shopscale/contracts/api - API route contracts
import { z } from 'zod';

// Health
export const healthLiveResponse = z.object({ status: z.literal('ok') });
export const healthReadyResponse = z.object({ 
  status: z.enum(['ok', 'degraded']), 
  checks: z.record(z.object({ status: z.enum(['ok', 'fail']), detail: z.string().optional() })) 
});

// Auth — canonical shapes live in ../identity.ts (T010a). The T002 draft
// (with `name`, body-carried refresh) is superseded per ADR-0004; do not
// re-add auth DTOs here.

// Products (public)
export const productListQuery = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  minPrice: z.coerce.number().int().positive().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popularity']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const productListResponse = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    brand: z.string().optional(),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    primaryImageUrl: z.string().url().optional(),
    ratingAvg: z.number().optional(),
    ratingCount: z.number().int().nonnegative(),
  })),
  nextCursor: z.string().nullable(),
});

export const productDetailResponse = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  brand: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  attributes: z.record(z.unknown()),
  images: z.array(z.object({ url: z.string().url(), alt: z.string().optional(), position: z.number().int() })),
  variants: z.array(z.object({
    id: z.string().uuid(),
    sku: z.string(),
    priceCents: z.number().int().nonnegative(),
    attributes: z.record(z.unknown()),
    onHand: z.number().int().nonnegative(),
  })),
  ratingAvg: z.number().optional(),
  ratingCount: z.number().int().nonnegative(),
});

// Search
export const searchQuery = z.object({
  q: z.string().min(1),
  filters: z.record(z.unknown()).optional(),
  facets: z.array(z.string()).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchResponse = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    brand: z.string().optional(),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    primaryImageUrl: z.string().url().optional(),
    storeId: z.string().uuid(),
    storeSlug: z.string(),
  })),
  facets: z.record(z.array(z.object({ value: z.string(), count: z.number().int().nonnegative() }))),
  nextCursor: z.string().nullable(),
});

export const autocompleteQuery = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const autocompleteResponse = z.object({
  suggestions: z.array(z.string()),
});

// Cart
export const cartResponse = z.object({
  channel: z.enum(['marketplace', 'store']),
  storeId: z.string().uuid().nullable(),
  items: z.array(z.object({
    id: z.string().uuid(),
    variantId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
    productTitle: z.string(),
    variantAttributes: z.record(z.unknown()),
    productImageUrl: z.string().url().optional(),
  })),
  subtotalCents: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
});

export const addCartItemRequest = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});

export const updateCartItemRequest = z.object({
  quantity: z.number().int().min(0),
});

// Checkout
export const checkoutRequest = z.object({
  idempotencyKey: z.string().uuid(),
  shippingAddressId: z.string().uuid(),
  billingAddressId: z.string().uuid().optional(),
  couponCode: z.string().optional(),
});

export const checkoutResponse = z.object({
  orderId: z.string().uuid(),
  status: z.enum(['PENDING', 'PAID', 'FAILED']),
  paymentUrl: z.string().url().optional(),
  expiresAt: z.string().datetime().optional(),
});

// Orders
export const orderListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const orderListResponse = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(['PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
    totalCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    itemCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
  })),
  nextCursor: z.string().nullable(),
});

export const orderDetailResponse = z.object({
  id: z.string().uuid(),
  status: z.enum(['PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  shippingCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.string().uuid(),
    sellerId: z.string().uuid(),
    variantId: z.string().uuid(),
    productTitle: z.string(),
    variantAttributes: z.record(z.unknown()),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
    lineTotalCents: z.number().int().nonnegative(),
  })),
  shippingAddress: z.object({
    name: z.string(),
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    region: z.string(),
    postalCode: z.string(),
    country: z.string().length(2),
    phone: z.string().optional(),
  }),
  billingAddress: z.object({
    name: z.string(),
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    region: z.string(),
    postalCode: z.string(),
    country: z.string().length(2),
    phone: z.string().optional(),
  }).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Seller
export const sellerProductCreateRequest = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(220),
  brand: z.string().max(100).optional(),
  description: z.string(),
  priceCents: z.number().int().positive(),
  currency: z.string().length(3).default('USD'),
  attributes: z.record(z.unknown()).default({}),
  variants: z.array(z.object({
    sku: z.string().min(1).max(100),
    priceCents: z.number().int().positive().optional(),
    attributes: z.record(z.unknown()).default({}),
    onHand: z.number().int().nonnegative().default(0),
  })).min(1),
  images: z.array(z.object({ url: z.string().url(), alt: z.string().optional(), position: z.number().int() })).optional(),
});

export const sellerInventoryAdjustRequest = z.object({
  variantId: z.string().uuid(),
  delta: z.number().int(),
  reason: z.enum(['restock', 'damage', 'correction', 'return']),
});

// Admin
export const adminSellerApproveRequest = z.object({
  action: z.enum(['approve', 'suspend', 'reject']),
  reason: z.string().optional(),
});

// Error (RFC 7807) — canonical contract lives in ../errors.ts (T006a).
// problemDetails is kept as an alias so earlier references do not drift.
export { problemResponse as problemDetails } from '../errors.js';