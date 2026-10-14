// @shopscale/backend/stores/theme.service - Theme validation and fallback.
// Reads are ALWAYS validated: a theme row containing anything outside the
// closed token set (compromised data, bad migration, hand edit) renders as
// DEFAULT_THEME, never as injected CSS. Writes (T068) validate the same way.

import { DEFAULT_THEME, themeTokensSchema } from '@shopscale/contracts';
import type { ThemeTokens } from '@shopscale/contracts';
import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';

export { DEFAULT_THEME };
export type { ThemeTokens };

/** Validate unknown row data; null when it must fall back to defaults. */
export function parseThemeTokens(raw: unknown): ThemeTokens | null {
  const parsed = themeTokensSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function isValidTheme(raw: unknown): boolean {
  return themeTokensSchema.safeParse(raw).success;
}

/** Storefront theme: validated row tokens or DEFAULT_THEME (never raw). */
export async function getTheme(storeId: string, sql: Sql = getDb()): Promise<ThemeTokens> {
  const rows = (await sql.unsafe(`SELECT "approved_tokens" FROM "store_themes" WHERE "store_id" = $1;`, [
    storeId,
  ])) as unknown as Array<{ approved_tokens: unknown }>;
  const row = rows[0];
  if (!row) return { ...DEFAULT_THEME };
  return parseThemeTokens(row.approved_tokens) ?? { ...DEFAULT_THEME };
}
