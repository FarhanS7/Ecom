// @shopscale/contracts/quote - Canonical checkout quote contracts (T045).
// Invariants:
// 1. Integer cents arithmetic exclusively (serialized as string in DTOs).
// 2. Multi-seller quote breakdown: subtotal, fixed shipping ($5/seller), and proportional discount.
// 3. Cryptographically signed quote token with 15-minute expiration.

import { z } from 'zod';

export const quoteRequestItemSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
  expectedUnitPriceCents: z.string().optional(),
});

export type QuoteRequestItem = z.infer<typeof quoteRequestItemSchema>;

export const quoteRequestSchema = z.object({
  channelKey: z.string().min(1),
  items: z.array(quoteRequestItemSchema).min(1),
  couponCode: z.string().trim().optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const quoteItemDtoSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
  title: z.string(),
  unitPriceCents: z.string(),
  totalCents: z.string(),
  discountCents: z.string(),
});

export type QuoteItemDto = z.infer<typeof quoteItemDtoSchema>;

export const quoteSellerDtoSchema = z.object({
  storeId: z.string().uuid(),
  storeName: z.string(),
  subtotalCents: z.string(),
  shippingCents: z.string(),
  discountCents: z.string(),
  totalCents: z.string(),
  items: z.array(quoteItemDtoSchema),
});

export type QuoteSellerDto = z.infer<typeof quoteSellerDtoSchema>;

export const quoteResponseSchema = z.object({
  quoteToken: z.string().min(1),
  expiresAt: z.string(),
  currency: z.literal('USD'),
  subtotalCents: z.string(),
  shippingCents: z.string(),
  discountCents: z.string(),
  totalCents: z.string(),
  couponCode: z.string().nullable().optional(),
  sellers: z.array(quoteSellerDtoSchema),
});

export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
