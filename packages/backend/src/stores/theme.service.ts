// @shopscale/backend/stores/theme.service - Theme validation, fallback, and updates (T016, T068).
// Reads are ALWAYS validated: a theme row containing anything outside the
// closed token set (compromised data, bad migration, hand edit) renders as
// DEFAULT_THEME, never as injected CSS. Writes validate the same way.

import { DEFAULT_THEME, themeTokensSchema } from '@shopscale/contracts';
import type { ThemeTokens } from '@shopscale/contracts';
import type { Sql, TransactionSql } from 'postgres';
import { getDb } from '../db/client.js';
import { authorizeStore } from './permissions.js';
import { recordAudit } from '../platform/audit-port.js';
import { OnboardingError } from './onboarding.service.js';

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

/** Save store theme tokens with permission check and audit recording. */
export async function saveTheme(
  input: {
    storeId: string;
    actorId: string;
    tokens: ThemeTokens;
    requestId: string;
  },
  sql: Sql = getDb(),
): Promise<ThemeTokens> {
  const parsed = themeTokensSchema.safeParse(input.tokens);
  if (!parsed.success) {
    throw new OnboardingError('CONFLICT', 'Invalid theme tokens.');
  }

  const canManage =
    (await authorizeStore({ userId: input.actorId, storeId: input.storeId, permission: 'store:manage' }, sql)) ||
    (await authorizeStore({ userId: input.actorId, storeId: input.storeId, permission: 'team:manage' }, sql));

  if (!canManage) {
    throw new OnboardingError('NOT_FOUND', 'Store not found.');
  }

  return (sql as unknown as { begin: <T>(cb: (tx: TransactionSql) => Promise<T>) => Promise<T> }).begin(
    async (tx: TransactionSql) => {
      const existing = (await tx.unsafe(
        `SELECT "approved_tokens" FROM "store_themes" WHERE "store_id" = $1;`,
        [input.storeId],
      )) as unknown as Array<{ approved_tokens: unknown }>;
      const beforeTokens = existing[0] ? parseThemeTokens(existing[0].approved_tokens) : null;

      await tx.unsafe(
        `INSERT INTO "store_themes" ("store_id", "version", "approved_tokens", "updated_at")
         VALUES ($1, 1, $2, now())
         ON CONFLICT ("store_id") DO UPDATE
         SET "approved_tokens" = $2, "version" = "store_themes"."version" + 1, "updated_at" = now();`,
        [input.storeId, JSON.stringify(parsed.data)],
      );

      await recordAudit(
        {
          actorId: input.actorId,
          storeId: input.storeId,
          action: 'store.theme_updated',
          entityType: 'theme',
          entityId: input.storeId,
          before: beforeTokens,
          after: parsed.data,
          requestId: input.requestId,
        },
        tx as unknown as Sql,
      );

      return parsed.data;
    },
  );
}
