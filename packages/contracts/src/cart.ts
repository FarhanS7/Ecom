// @shopscale/contracts/cart - Durable channel cart contracts (T041).
// Money is integer cents (data-model convention); priceCents and totalCents
// are serialized as strings in CartDto per contract specification.

import { z } from 'zod';

export const cartItemDtoSchema = z.object({
  id: z.string().uuid().optional(),
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
  title: z.string(),
  priceCents: z.string(),
  available: z.boolean(),
});

export type CartItemDto = z.infer<typeof cartItemDtoSchema>;

export const cartDtoSchema = z.object({
  id: z.string().uuid(),
  channelKey: z.string().min(1),
  items: z.array(cartItemDtoSchema),
  totalCents: z.string(),
  version: z.number().int().nonnegative(),
});

export type CartDto = z.infer<typeof cartDtoSchema>;

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export type AddCartItemRequest = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(99),
});

export type UpdateCartItemRequest = z.infer<typeof updateCartItemSchema>;

export const mergeCartRequestSchema = z.object({
  guestToken: z.string().optional(),
});

export type MergeCartRequest = z.infer<typeof mergeCartRequestSchema>;

export const mergeCartResponseSchema = z.object({
  mergedCart: cartDtoSchema,
});

export type MergeCartResponse = z.infer<typeof mergeCartResponseSchema>;
