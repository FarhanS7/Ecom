// @shopscale/contracts/checkout - Checkout creation and response contracts (T047).
// Invariants:
// 1. Mandatory Idempotency-Key header (UUID) guarantees retry safety.
// 2. Requires cryptographically signed acceptedQuoteToken.
// 3. AddressId must reference an existing address snapshot.
// 4. Returns 201 Created with orderId, paymentEffectKey, and totalCents.

import { z } from 'zod';

export const checkoutRequestSchema = z.object({
  channelKey: z.string().min(1),
  cartVersion: z.number().int().min(1).optional(),
  addressId: z.string().uuid(),
  acceptedQuoteToken: z.string().min(1),
});

export type CheckoutRequestDto = z.infer<typeof checkoutRequestSchema>;

export const checkoutAcceptedSchema = z.object({
  orderId: z.string().uuid(),
  status: z.literal('PENDING'),
  paymentEffectKey: z.string().min(1),
  totalCents: z.string(),
  expiresAt: z.string(),
});

export type CheckoutAcceptedDto = z.infer<typeof checkoutAcceptedSchema>;
