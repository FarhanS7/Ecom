// @shopscale/contracts/orders - Customer and seller order contracts (T055).
// Invariants:
// 1. Keyset cursor pagination on (created_at DESC, id DESC).
// 2. Monies strictly represented as integer cents.
// 3. Customer PII masked for unfulfilled / unpaid seller suborders.
// 4. Strict multi-tenant isolation: seller endpoints expose only that seller's suborder data.

import { z } from 'zod';

export const addressSnapshotSchema = z.object({
  fullName: z.string(),
  line1: z.string(),
  line2: z.string().nullable().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
  phone: z.string().nullable().optional(),
});
export type AddressSnapshotDto = z.infer<typeof addressSnapshotSchema>;

export const orderItemDtoSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  sellerOrderId: z.string().uuid(),
  storeId: z.string().uuid(),
  variantId: z.string().uuid(),
  title: z.string(),
  sku: z.string(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
});
export type OrderItemDto = z.infer<typeof orderItemDtoSchema>;

export const sellerSuborderDtoSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  storeId: z.string().uuid(),
  fulfillmentStatus: z.enum(['PENDING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  commissionBpsSnapshot: z.number().int().nonnegative(),
  trackingRef: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  shippedAt: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
  createdAt: z.string(),
  items: z.array(orderItemDtoSchema).optional(),
  shippingAddress: addressSnapshotSchema.optional(),
});
export type SellerSuborderDto = z.infer<typeof sellerSuborderDtoSchema>;

export const customerOrderDtoSchema = z.object({
  id: z.string().uuid(),
  channelKey: z.string(),
  storeId: z.string().uuid().nullable().optional(),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']),
  fulfillmentStatus: z.enum([
    'PENDING',
    'PACKED',
    'PARTIALLY_SHIPPED',
    'SHIPPED',
    'PARTIALLY_DELIVERED',
    'DELIVERED',
    'CANCELLED',
  ]),
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  currency: z.literal('USD'),
  couponCode: z.string().nullable().optional(),
  createdAt: z.string(),
  itemsCount: z.number().int().nonnegative().optional(),
});
export type CustomerOrderDto = z.infer<typeof customerOrderDtoSchema>;

export const customerOrderDetailDtoSchema = customerOrderDtoSchema.extend({
  address: addressSnapshotSchema,
  suborders: z.array(sellerSuborderDtoSchema),
  items: z.array(orderItemDtoSchema),
});
export type CustomerOrderDetailDto = z.infer<typeof customerOrderDetailDtoSchema>;

export const orderListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderListQueryDto = z.infer<typeof orderListQuerySchema>;

export const paginatedOrdersResponseSchema = z.object({
  items: z.array(customerOrderDtoSchema),
  nextCursor: z.string().nullable(),
});
export type PaginatedOrdersResponseDto = z.infer<typeof paginatedOrdersResponseSchema>;

export const paginatedSellerSubordersResponseSchema = z.object({
  items: z.array(sellerSuborderDtoSchema),
  nextCursor: z.string().nullable(),
});
export type PaginatedSellerSubordersResponseDto = z.infer<typeof paginatedSellerSubordersResponseSchema>;

export const fulfillmentTransitionSchema = z.object({
  toStatus: z.enum(['PACKED', 'SHIPPED', 'DELIVERED']),
  trackingRef: z.string().trim().min(1).optional(),
  carrier: z.string().trim().min(1).optional(),
});
export type FulfillmentTransitionDto = z.infer<typeof fulfillmentTransitionSchema>;

export const suborderTransitionResponseSchema = z.object({
  success: z.boolean(),
  suborder: sellerSuborderDtoSchema,
  parentFulfillmentStatus: z.enum([
    'PENDING',
    'PACKED',
    'PARTIALLY_SHIPPED',
    'SHIPPED',
    'PARTIALLY_DELIVERED',
    'DELIVERED',
    'CANCELLED',
  ]),
});
export type SuborderTransitionResponseDto = z.infer<typeof suborderTransitionResponseSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});
export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;

export const cancelOrderResponseSchema = z.object({
  success: z.boolean(),
  orderId: z.string().uuid(),
  fulfillmentStatus: z.literal('CANCELLED'),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']),
  refundInitiated: z.boolean(),
});
export type CancelOrderResponseDto = z.infer<typeof cancelOrderResponseSchema>;

export const createReturnRequestSchema = z.object({
  orderItemId: z.string().uuid(),
  qty: z.number().int().positive(),
  reason: z.string().trim().min(1),
  customerNotes: z.string().trim().optional(),
});
export type CreateReturnRequestDto = z.infer<typeof createReturnRequestSchema>;

export const returnRequestDtoSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  sellerOrderId: z.string().uuid(),
  storeId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  userId: z.string().uuid(),
  qty: z.number().int().positive(),
  reason: z.string(),
  customerNotes: z.string().nullable().optional(),
  status: z.enum(['PENDING_INSPECTION', 'APPROVED', 'REJECTED']),
  inspectionNotes: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ReturnRequestDto = z.infer<typeof returnRequestDtoSchema>;

export const inspectReturnRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  inspectionNotes: z.string().trim().optional(),
  restock: z.boolean().default(false),
});
export type InspectReturnRequestDto = z.infer<typeof inspectReturnRequestSchema>;

export const sellerReturnRequestDtoSchema = returnRequestDtoSchema.extend({
  itemTitle: z.string(),
  itemSku: z.string(),
  itemUnitPriceCents: z.number().int().nonnegative(),
});
export type SellerReturnRequestDto = z.infer<typeof sellerReturnRequestDtoSchema>;

export const invoiceDtoSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  invoiceNumber: z.string(),
  totalCents: z.number().int().nonnegative(),
  currency: z.string(),
  status: z.enum(['PENDING', 'GENERATED', 'FAILED']),
  downloadUrl: z.string().url().optional(),
  createdAt: z.string(),
});
export type InvoiceDto = z.infer<typeof invoiceDtoSchema>;

export const supportRefundRequestSchema = z.object({
  orderId: z.string().uuid(),
  amountCents: z
    .number()
    .int()
    .positive('Refund amount must be positive')
    .optional(),
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
});
export type SupportRefundRequestDto = z.infer<typeof supportRefundRequestSchema>;

export const supportRefundResponseSchema = z.object({
  refundId: z.string().uuid(),
  orderId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  remainingCents: z.number().int().nonnegative(),
  isFullyRefunded: z.boolean(),
  status: z.literal('COMPLETED'),
});
export type SupportRefundResponseDto = z.infer<typeof supportRefundResponseSchema>;





