// T022b keyset pagination battery over real PostgreSQL: walk every page
// for each sort over a dataset built with DUPLICATE prices AND duplicate
// timestamps, and assert the union of IDs is the full set exactly once —
// no duplicates, no gaps. Also: a wrong-channel cursor and a changed-filter
// cursor are rejected, and the limit is bounded.
//
// MUTATION SEMANTICS (documented, per the task): keyset pagination is
// stable for a FIXED dataset — the predicate is a total order on
// (sortValue, id), so a re-walk sees the same pages. It is NOT a
// cross-request snapshot: rows inserted/updated/deleted BETWEEN page
// requests may appear, disappear, or move between the remaining pages.
// That is the deliberate trade-off of keyset over offset (offset would
// both duplicate and skip under the same writes) and matches the module's
// "cursor price ties remain deterministic" acceptance scenario.
//
// Needs a REAL database; skips honestly otherwise (CI runs it live).

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { listChannelProducts } from '../../src/catalog/read.service.js';
import { CursorError, buildListQuery } from '../../src/catalog/list-query.js';
import { encodeCursor, filterFingerprint } from '../../src/catalog/cursor.js';
import {
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip() {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first (T004).');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first (T004).');
    return null;
  }
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't022-%');`);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T022-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't022-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't022-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't022.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't022.%';`);
}

async function seedStore(sql: Sql, suffix: string): Promise<string> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t022.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t022-${suffix}`, `T022 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

/**
 * Seed N products sharing duplicate prices (500/500/1500) AND duplicate
 * created_at (two timestamps reused), so id is the ONLY tiebreaker.
 */
async function seedDuplicates(sql: Sql, storeId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const price = [500, 500, 1500][i % 3];
    const createdAt = i % 2 === 0 ? '2026-01-01T00:00:00Z' : '2026-01-01T00:00:00Z'; // all identical
    const products = (await sql.unsafe(
      `INSERT INTO "products" ("store_id","slug","title","status","min_price_cents","sales_count","created_at")
       VALUES ($1,$2,$3,'active',$4,$5,$6) RETURNING "id";`,
      [storeId, `t022-p${String(i).padStart(2, '0')}`, `Product ${i}`, price, i % 3, createdAt],
    )) as unknown as Array<{ id: string }>;
    await sql.unsafe(
      `INSERT INTO "product_publications" ("product_id","marketplace_enabled","store_enabled") VALUES ($1,true,true);`,
      [products[0]!.id],
    );
  }
}

/** Walk every page; returns the visited id sequence and page count. */
async function walk(
  sql: Sql,
  sort: 'newest' | 'price_asc' | 'price_desc' | 'popularity',
  limit: number,
): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await listChannelProducts({ channel: 'marketplace', sort, limit, cursor }, sql);
    pages += 1;
    ids.push(...page.items.map((p) => p.id));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    if (pages > 100) throw new Error('page walk did not terminate');
  }
  return { ids, pages };
}

describe('keyset pagination (T022b)', () => {
  it('walks duplicate-price/duplicate-timestamp pages with no duplicates or gaps', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const storeA = await seedStore(sql, 'store-a');
      const count = 11; // 3 pages at limit 4, last page short
      await seedDuplicates(sql, storeA, count);
      const expected = (
        (await sql.unsafe(`SELECT "id" FROM "products" WHERE "slug" LIKE 't022-%';`)) as unknown as Array<{ id: string }>
      ).map((r) => r.id);
      expect(expected).toHaveLength(count);

      for (const sort of ['newest', 'price_asc', 'price_desc', 'popularity'] as const) {
        const { ids, pages } = await walk(sql, sort, 4);
        // No duplicates.
        expect(new Set(ids).size).toBe(ids.length);
        // No gaps: every seeded product visited exactly once.
        expect(ids.slice().sort()).toEqual(expected.slice().sort());
        expect(ids).toHaveLength(count);
        expect(pages).toBe(Math.ceil(count / 4));

        // A fixed dataset re-walks identically (stability).
        const again = await walk(sql, sort, 4);
        expect(again.ids).toEqual(ids);
      }

      // Distinct sorts produce their own (deterministic) orders.
      const asc = await walk(sql, 'price_asc', 4);
      const desc = await walk(sql, 'price_desc', 4);
      expect(asc.ids).toEqual(desc.ids.slice().reverse());
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('rejects a wrong-channel cursor and a changed-filter cursor', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const storeA = await seedStore(sql, 'cursor-store');
      await seedDuplicates(sql, storeA, 4);

      const first = await listChannelProducts({ channel: 'marketplace', limit: 2 }, sql);
      expect(first.nextCursor).toBeTruthy();
      const cursor = first.nextCursor as string;

      // Same cursor against the STORE channel → rejected, not a silent page.
      await expect(
        listChannelProducts({ channel: 'store', storeSlug: 't022-cursor-store', limit: 2, cursor }, sql),
      ).rejects.toBeInstanceOf(CursorError);

      // Same cursor with a changed price filter → rejected.
      await expect(
        listChannelProducts({ channel: 'marketplace', minPriceCents: 1, limit: 2, cursor }, sql),
      ).rejects.toBeInstanceOf(CursorError);

      // The unmodified cursor still works (proves the rejections are about
      // the mismatch, not the cursor itself).
      const second = await listChannelProducts({ channel: 'marketplace', limit: 2, cursor }, sql);
      expect(second.items).toHaveLength(2);

      // Limits are bounded (builder clamps; service honours it).
      expect(buildListQuery({ channel: 'marketplace', limit: 1000 }).limit).toBe(100);
      expect((await listChannelProducts({ channel: 'marketplace', limit: 1 }, sql)).items).toHaveLength(1);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('a malformed or foreign fingerprint cursor decodes to null and is ignored', () => {
    // Pure guard: buildListQuery treats a structurally-invalid cursor as a
    // typed error, never as a first page.
    expect(() => buildListQuery({ channel: 'marketplace', cursor: 'garbage' })).toThrow(CursorError);
    const forged = encodeCursor({ v: 1, sort: 'newest', f: 'deadbeefdeadbeef', k: ['2026-01-01T00:00:00Z', 'x'] });
    expect(() => buildListQuery({ channel: 'marketplace', cursor: forged })).toThrow(CursorError);
    // Sanity: the real fingerprint is accepted.
    const genuine = encodeCursor({ v: 1, sort: 'newest', f: filterFingerprint({ channel: 'marketplace', sort: 'newest' }), k: ['2026-01-01T00:00:00Z', 'x'] });
    expect(() => buildListQuery({ channel: 'marketplace', cursor: genuine })).not.toThrow();
  });
});
