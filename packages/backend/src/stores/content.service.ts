// @shopscale/backend/stores/content.service - Homepage banner and storefront content (T016, T068).

import type { StoreContentDto, UpdateStoreContentDto } from '@shopscale/contracts';
import { updateStoreContentSchema } from '@shopscale/contracts';
import type { Sql, TransactionSql } from 'postgres';
import { getDb } from '../db/client.js';
import { authorizeStore } from './permissions.js';
import { recordAudit } from '../platform/audit-port.js';
import { OnboardingError } from './onboarding.service.js';

export async function getStoreContent(storeId: string, sql: Sql = getDb()): Promise<StoreContentDto> {
  const rows = (await sql.unsafe(
    `SELECT "store_id", "version", "featured_ids", "headline", "socials", "swatches", "updated_at"
     FROM "store_content" WHERE "store_id" = $1;`,
    [storeId],
  )) as unknown as Array<{
    store_id: string;
    version: number;
    featured_ids: string[];
    headline: string | null;
    socials: Record<string, string>;
    swatches: Record<string, string>;
    updated_at: Date;
  }>;

  const row = rows[0];
  if (!row) {
    return {
      storeId,
      version: 1,
      headline: null,
      featuredIds: [],
      socials: {},
      swatches: {},
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    storeId: row.store_id,
    version: row.version,
    headline: row.headline,
    featuredIds: Array.isArray(row.featured_ids) ? row.featured_ids : [],
    socials: typeof row.socials === 'object' && row.socials !== null ? row.socials : {},
    swatches: typeof row.swatches === 'object' && row.swatches !== null ? row.swatches : {},
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date().toISOString(),
  };
}

export async function saveStoreContent(
  input: {
    storeId: string;
    actorId: string;
    content: UpdateStoreContentDto;
    requestId: string;
  },
  sql: Sql = getDb(),
): Promise<StoreContentDto> {
  const parsed = updateStoreContentSchema.safeParse(input.content);
  if (!parsed.success) {
    throw new OnboardingError('CONFLICT', 'Invalid store content.');
  }

  const canManage =
    (await authorizeStore({ userId: input.actorId, storeId: input.storeId, permission: 'store:manage' }, sql)) ||
    (await authorizeStore({ userId: input.actorId, storeId: input.storeId, permission: 'team:manage' }, sql)) ||
    (await authorizeStore({ userId: input.actorId, storeId: input.storeId, permission: 'catalog:manage' }, sql));

  if (!canManage) {
    throw new OnboardingError('NOT_FOUND', 'Store not found.');
  }

  return (sql as unknown as { begin: <T>(cb: (tx: TransactionSql) => Promise<T>) => Promise<T> }).begin(
    async (tx: TransactionSql) => {
      const existing = (await tx.unsafe(
        `SELECT "store_id", "version", "featured_ids", "headline", "socials", "swatches", "updated_at"
         FROM "store_content" WHERE "store_id" = $1;`,
        [input.storeId],
      )) as unknown as Array<{
        store_id: string;
        version: number;
        featured_ids: string[];
        headline: string | null;
        socials: Record<string, string>;
        swatches: Record<string, string>;
        updated_at: Date;
      }>;

      const current = existing[0];
      const nextHeadline = parsed.data.headline !== undefined ? parsed.data.headline : (current?.headline ?? null);
      const nextFeatured = parsed.data.featuredIds !== undefined ? parsed.data.featuredIds : (current?.featured_ids ?? []);
      const nextSocials = parsed.data.socials !== undefined ? parsed.data.socials : (current?.socials ?? {});
      const nextSwatches = parsed.data.swatches !== undefined ? parsed.data.swatches : (current?.swatches ?? {});

      const rows = (await tx.unsafe(
        `INSERT INTO "store_content" ("store_id", "version", "featured_ids", "headline", "socials", "swatches", "updated_at")
         VALUES ($1, 1, $2, $3, $4, $5, now())
         ON CONFLICT ("store_id") DO UPDATE
         SET "featured_ids" = $2, "headline" = $3, "socials" = $4, "swatches" = $5, "version" = "store_content"."version" + 1, "updated_at" = now()
         RETURNING "store_id", "version", "featured_ids", "headline", "socials", "swatches", "updated_at";`,
        [input.storeId, JSON.stringify(nextFeatured), nextHeadline, JSON.stringify(nextSocials), JSON.stringify(nextSwatches)],
      )) as unknown as Array<{
        store_id: string;
        version: number;
        featured_ids: string[];
        headline: string | null;
        socials: Record<string, string>;
        swatches: Record<string, string>;
        updated_at: Date;
      }>;

      const saved = rows[0]!;

      await recordAudit(
        {
          actorId: input.actorId,
          storeId: input.storeId,
          action: 'store.content_updated',
          entityType: 'content',
          entityId: input.storeId,
          before: current
            ? {
                headline: current.headline,
                featuredIds: current.featured_ids,
                socials: current.socials,
              }
            : null,
          after: {
            headline: nextHeadline,
            featuredIds: nextFeatured,
            socials: nextSocials,
          },
          requestId: input.requestId,
        },
        tx as unknown as Sql,
      );

      return {
        storeId: saved.store_id,
        version: saved.version,
        headline: saved.headline,
        featuredIds: Array.isArray(saved.featured_ids) ? saved.featured_ids : [],
        socials: typeof saved.socials === 'object' && saved.socials !== null ? saved.socials : {},
        swatches: typeof saved.swatches === 'object' && saved.swatches !== null ? saved.swatches : {},
        updatedAt: saved.updated_at instanceof Date ? saved.updated_at.toISOString() : new Date().toISOString(),
      };
    },
  );
}
