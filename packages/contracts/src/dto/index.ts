// @shopscale/contracts/dto - Shared DTOs / value objects
import { z } from 'zod';

export const money = z.object({
  cents: z.number().int(),
  currency: z.string().length(3),
});

export const address = z.object({
  name: z.string().min(1).max(100),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2),
  phone: z.string().max(30).optional(),
});

export const paginationCursor = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const paginationResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });

export const idempotencyKey = z.string().uuid();

export const uuid = z.string().uuid();

export const timestamp = z.string().datetime();

export const slug = z.string().min(1).max(220).regex(/^[a-z0-9-]+$/);

export const sku = z.string().min(1).max(100).regex(/^[A-Z0-9-_]+$/);