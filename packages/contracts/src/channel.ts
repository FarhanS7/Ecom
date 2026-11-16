// @shopscale/contracts/channel - Storefront channel, theme, and store settings contracts (T016, T068).
// Theme tokens are a CLOSED set: six hex colors plus an integer radius.
// Anything else (CSS functions, URLs, HTML, unknown keys) is rejected at the
// boundary, so a compromised theme row can only ever render flat colors.
// Single source for the read path (theme.service), the write path
// (T068), and storefront rendering.

import { z } from 'zod';

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const themeTokensSchema = z
  .object({
    primary: hexColor,
    background: hexColor,
    surface: hexColor,
    text: hexColor,
    muted: hexColor,
    accent: hexColor,
    radius: z.number().int().min(0).max(16),
  })
  .strict();

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export const DEFAULT_THEME: ThemeTokens = {
  primary: '#1a1a2e',
  background: '#ffffff',
  surface: '#f8f9fa',
  text: '#1a1a2e',
  muted: '#6a737d',
  accent: '#e94560',
  radius: 8,
};

export const storeChannelResponse = z.object({
  channel: z.literal('store'),
  slug: z.string().min(1),
  name: z.string().min(1),
  theme: themeTokensSchema,
});

export type StoreChannelResponse = z.infer<typeof storeChannelResponse>;

export const updateStoreThemeSchema = z.object({
  theme: themeTokensSchema,
});

export type UpdateStoreThemeDto = z.infer<typeof updateStoreThemeSchema>;

export const storeStaffRoleSchema = z.enum(['owner', 'manager', 'catalog-editor', 'fulfillment']);
export type StoreStaffRole = z.infer<typeof storeStaffRoleSchema>;

export const inviteStaffSchema = z.object({
  email: z.string().email().max(254),
  role: storeStaffRoleSchema,
});

export type InviteStaffDto = z.infer<typeof inviteStaffSchema>;

export const storeMemberDtoSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: storeStaffRoleSchema,
  status: z.enum(['active', 'revoked']),
  joinedAt: z.string().datetime().optional(),
});

export type StoreMemberDto = z.infer<typeof storeMemberDtoSchema>;

export const storePendingInvitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: storeStaffRoleSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type StorePendingInvitationDto = z.infer<typeof storePendingInvitationSchema>;

export const storeTeamSummarySchema = z.object({
  storeId: z.string().uuid(),
  members: z.array(storeMemberDtoSchema),
  invitations: z.array(storePendingInvitationSchema),
});

export type StoreTeamSummaryDto = z.infer<typeof storeTeamSummarySchema>;

export const storeContentSchema = z.object({
  storeId: z.string().uuid(),
  version: z.number().int().positive(),
  headline: z.string().nullable().optional(),
  featuredIds: z.array(z.string().uuid()).default([]),
  socials: z.record(z.string()).default({}),
  swatches: z.record(z.string()).default({}),
  updatedAt: z.string().datetime().optional(),
});

export type StoreContentDto = z.infer<typeof storeContentSchema>;

export const updateStoreContentSchema = z.object({
  headline: z.string().max(255).nullable().optional(),
  featuredIds: z.array(z.string().uuid()).optional(),
  socials: z.record(z.string()).optional(),
  swatches: z.record(z.string()).optional(),
});

export type UpdateStoreContentDto = z.infer<typeof updateStoreContentSchema>;

export const adminSellerSummarySchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'active', 'suspended']),
  ownerEmail: z.string(),
  createdAt: z.string(),
});
export type AdminSellerSummaryDto = z.infer<typeof adminSellerSummarySchema>;

export const adminSellerListResponseSchema = z.object({
  items: z.array(adminSellerSummarySchema),
});
export type AdminSellerListResponseDto = z.infer<typeof adminSellerListResponseSchema>;

