// @shopscale/contracts/catalog - Catalog DTOs (T020a).
// Money is nonnegative integer cents (data-model convention); clients send
// `expectedVersion` on every update so optimistic concurrency is explicit
// at the contract boundary, not an implementation detail.

import { z } from 'zod';

/** Integer cents, bounded at 10,000,000 cents ($100k demo ceiling). */
const cents = z.number().int().nonnegative().max(10_000_000);

export const productCreateRequest = z.object({
  categoryId: z.string().uuid().nullable(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug'),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  brand: z.string().max(120).nullable().default(null),
  attributes: z.record(z.unknown()).default({}),
  currency: z.string().length(3).default('usd'),
});

export type ProductCreateRequest = z.infer<typeof productCreateRequest>;

export const productUpdateRequest = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  brand: z.string().max(120).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type ProductUpdateRequest = z.infer<typeof productUpdateRequest>;

export const variantCreateRequest = z.object({
  sku: z.string().min(1).max(64),
  priceCents: cents,
  attributes: z.record(z.unknown()).default({}),
});

export type VariantCreateRequest = z.infer<typeof variantCreateRequest>;

export const variantUpdateRequest = z.object({
  expectedVersion: z.number().int().positive(),
  priceCents: cents.optional(),
  attributes: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export type VariantUpdateRequest = z.infer<typeof variantUpdateRequest>;

/** Safe product DTO for seller screens; rating/sales are projection state. */
export const productResponse = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  brand: z.string().nullable(),
  status: z.enum(['draft', 'active', 'archived']),
  attributes: z.record(z.unknown()),
  minPriceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  version: z.number().int().positive(),
  marketplaceEnabled: z.boolean(),
  storeEnabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ProductResponse = z.infer<typeof productResponse>;

// Named for the SELLER screen; the T002 public-read `productListResponse`
// draft (api/index.ts, T021) keeps its name and shape.
export const sellerProductListResponse = z.object({
  items: z.array(productResponse),
});

export type SellerProductListResponse = z.infer<typeof sellerProductListResponse>;

export const variantResponse = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sku: z.string(),
  priceCents: z.number().int().nonnegative(),
  attributes: z.record(z.unknown()),
  status: z.enum(['active', 'inactive']),
});

export type VariantResponse = z.infer<typeof variantResponse>;

export const variantListResponse = z.object({
  items: z.array(variantResponse),
});

export type VariantListResponse = z.infer<typeof variantListResponse>;

export const publicationToggleRequest = z.object({
  marketplaceEnabled: z.boolean().optional(),
  storeEnabled: z.boolean().optional(),
});

export type PublicationToggleRequest = z.infer<typeof publicationToggleRequest>;

// --- Channel-aware public reads (T021a) ---------------------------------
// Trimming of the T002 draft shapes (api/index.ts): `primaryImageUrl`,
// `images`, and `onHand` are omitted because media (T035) and inventory
// (T032) tables do not exist yet — shipping URL fields that can never be
// populated would lie to clients. The list/detail DTO names are channel-
// specific so the T002 drafts stay untouched until T025 retires them.

export const channelListQuery = z.object({
  category: z.string().max(80).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popularity']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Opaque keyset cursor from a previous page's nextCursor (T022b).
  cursor: z.string().max(512).optional(),
});

export type ChannelListQueryInput = z.infer<typeof channelListQuery>;

export const channelProductSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  brand: z.string().nullable(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  ratingCount: z.number().int().nonnegative(),
});

export type ChannelProductSummaryDto = z.infer<typeof channelProductSummary>;

export const channelListResponse = z.object({
  items: z.array(channelProductSummary),
  // Always null until T022 adds keyset cursors; shape is final now.
  nextCursor: z.string().nullable(),
});

export type ChannelListResponse = z.infer<typeof channelListResponse>;

export const channelProductDetail = channelProductSummary.extend({
  description: z.string(),
  attributes: z.record(z.unknown()),
  status: z.string(),
  store: z.object({ slug: z.string(), name: z.string() }),
  variants: z.array(
    z.object({
      id: z.string().uuid(),
      sku: z.string(),
      priceCents: z.number().int().nonnegative(),
      attributes: z.record(z.unknown()),
    }),
  ),
});

export type ChannelProductDetailDto = z.infer<typeof channelProductDetail>;
