// packages/contracts/src/promotions.ts - Promotion and coupon contracts (OR-9 / T063).

import { z } from 'zod';

export const couponKindSchema = z.enum(['PERCENT', 'FIXED']);
export type CouponKind = z.infer<typeof couponKindSchema>;

export const couponStatusSchema = z.enum(['active', 'disabled']);
export type CouponStatus = z.infer<typeof couponStatusSchema>;

export const couponUseStatusSchema = z.enum(['HELD', 'REDEEMED', 'RELEASED']);
export type CouponUseStatus = z.infer<typeof couponUseStatusSchema>;

export const couponDtoSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid().nullable(),
  code: z.string(),
  kind: couponKindSchema,
  value: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  globalLimit: z.number().int().nonnegative(),
  perUserLimit: z.number().int().positive(),
  heldCount: z.number().int().nonnegative(),
  redeemedCount: z.number().int().nonnegative(),
  status: couponStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CouponDto = z.infer<typeof couponDtoSchema>;

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'Coupon code must be at least 3 characters')
      .max(64, 'Coupon code must be at most 64 characters')
      .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code must be alphanumeric with dashes or underscores'),
    kind: couponKindSchema,
    value: z.number().int().positive('Value must be a positive integer'),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime(),
    globalLimit: z.number().int().nonnegative().default(0),
    perUserLimit: z.number().int().positive().default(1),
  })
  .refine(
    (data) => {
      if (data.kind === 'PERCENT') {
        return data.value <= 100;
      }
      return true;
    },
    {
      message: 'Percentage coupon value cannot exceed 100%',
      path: ['value'],
    },
  );

export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const listCouponsResponseSchema = z.object({
  coupons: z.array(couponDtoSchema),
});

export type ListCouponsResponse = z.infer<typeof listCouponsResponseSchema>;

export const validateCouponRequestSchema = z.object({
  code: z.string().trim().min(1, 'Coupon code is required'),
  subtotalCents: z.number().int().nonnegative(),
  storeIds: z.array(z.string().uuid()).optional().default([]),
});

export type ValidateCouponRequest = z.infer<typeof validateCouponRequestSchema>;

export const validateCouponResponseSchema = z.object({
  valid: z.boolean(),
  code: z.string(),
  kind: couponKindSchema.optional(),
  value: z.number().optional(),
  discountCents: z.number().int().nonnegative(),
  storeScoped: z.boolean().default(false),
  message: z.string().optional(),
});

export type ValidateCouponResponse = z.infer<typeof validateCouponResponseSchema>;
