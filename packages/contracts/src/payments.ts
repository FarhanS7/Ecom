// @shopscale/contracts/payments - Payment provider and webhook contracts (T049).
// Invariants:
// 1. All amounts are integer cents serialized as string.
// 2. Stable effect keys identify operations across retries.
// 3. Webhook payloads carry eventId for idempotency and timestamp for replay safety.

import { z } from 'zod';

export const paymentOutcomeSchema = z.enum(['SUCCESS', 'DECLINED', 'TIMEOUT']);
export type PaymentOutcome = z.infer<typeof paymentOutcomeSchema>;

export const mockChargeRequestSchema = z.object({
  effectKey: z.string().min(1),
  amountCents: z.string().regex(/^\d+$/),
  currency: z.literal('USD').default('USD'),
  returnUrl: z.string().url().optional(),
  webhookUrl: z.string().url().optional(),
  simulateOutcome: paymentOutcomeSchema.optional().default('SUCCESS'),
  delayMs: z.number().int().nonnegative().optional().default(0),
});
export type MockChargeRequestDto = z.infer<typeof mockChargeRequestSchema>;

export const mockChargeResponseSchema = z.object({
  effectKey: z.string(),
  providerRef: z.string(),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED']),
  amountCents: z.string(),
  currency: z.literal('USD'),
  simulateOutcome: paymentOutcomeSchema,
  createdAt: z.string(),
});
export type MockChargeResponseDto = z.infer<typeof mockChargeResponseSchema>;

export const paymentWebhookTypeSchema = z.enum(['payment.succeeded', 'payment.failed']);
export type PaymentWebhookType = z.infer<typeof paymentWebhookTypeSchema>;

export const paymentWebhookPayloadSchema = z.object({
  eventId: z.string().uuid(),
  type: paymentWebhookTypeSchema,
  effectKey: z.string(),
  amountCents: z.string(),
  providerRef: z.string(),
  timestamp: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});
export type PaymentWebhookPayload = z.infer<typeof paymentWebhookPayloadSchema>;
