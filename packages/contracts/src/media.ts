// @shopscale/contracts/media - Media asset upload contracts (T035).
import { z } from 'zod';

export const createUploadGrantRequest = z.object({
  filename: z.string().min(1).max(255),
  declaredType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  bytes: z.number().int().positive().max(10 * 1024 * 1024),
});

export type CreateUploadGrantRequest = z.infer<typeof createUploadGrantRequest>;

export const uploadGrantResponse = z.object({
  assetId: z.string().uuid(),
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1),
  expiresAt: z.string(),
});

export type UploadGrantResponse = z.infer<typeof uploadGrantResponse>;

export const completeUploadResponse = z.object({
  assetId: z.string().uuid(),
  status: z.enum(['quarantined', 'ready', 'rejected']),
  detectedType: z.string().nullable(),
  url: z.string().nullable(),
});

export type CompleteUploadResponse = z.infer<typeof completeUploadResponse>;
