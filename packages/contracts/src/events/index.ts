// @shopscale/contracts/events - Domain event contracts
import { z } from 'zod';

export const eventEnvelope = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  occurredAt: z.string().datetime(),
  payload: z.unknown(),
});

export const productCreated = z.object({
  productId: z.string().uuid(),
  sellerId: z.string().uuid(),
  categoryId: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
});

export const productUpdated = z.object({
  productId: z.string().uuid(),
  changes: z.record(z.unknown()),
});

export const productPublished = z.object({
  productId: z.string().uuid(),
  channels: z.array(z.enum(['marketplace', 'store'])),
});

export const productUnpublished = z.object({
  productId: z.string().uuid(),
  channels: z.array(z.enum(['marketplace', 'store'])),
});

export const inventoryReserved = z.object({
  reservationId: z.string().uuid(),
  orderId: z.string().uuid(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })),
  expiresAt: z.string().datetime(),
});

export const inventoryReleased = z.object({
  reservationId: z.string().uuid(),
  reason: z.enum(['expired', 'cancelled', 'payment_failed']),
});

export const inventoryConfirmed = z.object({
  reservationId: z.string().uuid(),
  orderId: z.string().uuid(),
});

export const orderCreated = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  channel: z.enum(['marketplace', 'store']),
  storeId: z.string().uuid().nullable(),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  idempotencyKey: z.string().uuid(),
});

export const orderPaid = z.object({
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  providerRef: z.string(),
  amountCents: z.number().int().nonnegative(),
});

export const orderCancelled = z.object({
  orderId: z.string().uuid(),
  reason: z.string(),
});

export const suborderCreated = z.object({
  suborderId: z.string().uuid(),
  orderId: z.string().uuid(),
  sellerId: z.string().uuid(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
  })),
});

export const suborderStatusChanged = z.object({
  suborderId: z.string().uuid(),
  fromStatus: z.enum(['PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  toStatus: z.enum(['PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
});

export const paymentInitiated = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  effectKey: z.string(),
});

export const paymentWebhookReceived = z.object({
  eventId: z.string().uuid(),
  provider: z.string(),
  payload: z.unknown(),
  receivedAt: z.string().datetime(),
});

export const reviewCreated = z.object({
  reviewId: z.string().uuid(),
  productId: z.string().uuid(),
  customerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
});

export const couponRedeemed = z.object({
  couponId: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  discountCents: z.number().int().nonnegative(),
});