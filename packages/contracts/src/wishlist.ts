// packages/contracts/src/wishlist.ts - Customer wishlist contracts (REQ-ENG-001 / T065).

import { z } from 'zod';

export const wishlistItemDtoSchema = z.object({
  productId: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
  imageUrl: z.string().nullable().optional(),
  available: z.boolean(),
  status: z.string(),
  storeName: z.string().optional(),
  storeSlug: z.string().optional(),
  primaryVariantId: z.string().uuid().nullable().optional(),
  addedAt: z.string().datetime(),
});

export type WishlistItemDto = z.infer<typeof wishlistItemDtoSchema>;

export const wishlistResponseSchema = z.object({
  items: z.array(wishlistItemDtoSchema),
  count: z.number().int().nonnegative(),
});

export type WishlistResponseDto = z.infer<typeof wishlistResponseSchema>;
