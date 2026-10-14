// @shopscale/contracts/channel - Storefront channel and theme contracts (T016).
// Theme tokens are a CLOSED set: six hex colors plus an integer radius.
// Anything else (CSS functions, URLs, HTML, unknown keys) is rejected at the
// boundary, so a compromised theme row can only ever render flat colors.
// Single source for the read path (theme.service), the future write path
// (T068), and storefront rendering.

import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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
