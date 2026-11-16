// T033 integration verification for Redis cache-aside & stampede control.
// Invariants:
// 1. 50 concurrent requests for the same PDP trigger exactly 1 database execution.
// 2. Subsequent queries hit Redis cache directly without SQL queries.
// 3. Domain event cache invalidation (cache:pdp:*) forces a fresh SQL query.
// 4. Fallback behavior: if Redis is disconnected or throws, calls transparently query DB.

import { describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { getChannelProduct } from '../../src/catalog/read.service.js';
import { RedisCacheService } from '../../src/platform/cache.service.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
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

async function seedStore(sql: Sql, suffix: string): Promise<string> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t033.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t033-${suffix}`, `T033 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't033-%');`);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T033-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't033-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't033-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't033.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't033.%';`);
}

describe('Scoped Product Caching and Stampede Control (T033)', () => {
  it('50 concurrent PDP requests trigger exactly 1 DB execution with single-flight mutex', async () => {
    const memoryStore = new Map<string, string>();
    let lockHolder: string | null = null;

    const mockRedis = {
      get: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
      set: vi.fn(async (key: string, val: string, ...args: unknown[]) => {
        if (args[0] === 'EX' && args[2] === 'NX') {
          if (lockHolder) return null;
          lockHolder = key;
          return 'OK';
        }
        memoryStore.set(key, val);
        return 'OK';
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const k of keys) {
          if (lockHolder === k) lockHolder = null;
          memoryStore.delete(k);
        }
        return keys.length;
      }),
      keys: vi.fn(async (pattern: string) => {
        const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
        return Array.from(memoryStore.keys()).filter((k) => regex.test(k));
      }),
    };

    const cache = new RedisCacheService(mockRedis as never);

    let dbCallCount = 0;
    const fakeLoader = async () => {
      dbCallCount++;
      await new Promise((r) => setTimeout(r, 60)); // Simulate PostgreSQL query latency
      return { id: 'prod-123', slug: 'wireless-mouse', title: 'Wireless Mouse' };
    };

    // Fire 50 concurrent requests
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        cache.getOrSet('cache:pdp:marketplace:wireless-mouse', 300, fakeLoader),
      ),
    );

    // Assert stampede protection: only 1 execution
    expect(dbCallCount).toBe(1);
    for (const res of results) {
      expect(res.slug).toBe('wireless-mouse');
    }

    // Subsequent read hits cache with 0 additional DB calls
    const cachedRes = await cache.getOrSet('cache:pdp:marketplace:wireless-mouse', 300, fakeLoader);
    expect(dbCallCount).toBe(1);
    expect(cachedRes.slug).toBe('wireless-mouse');

    // Invalidation forces next request to call DB again
    await cache.invalidatePattern('cache:pdp:*');
    const freshRes = await cache.getOrSet('cache:pdp:marketplace:wireless-mouse', 300, fakeLoader);
    expect(dbCallCount).toBe(2);
    expect(freshRes.slug).toBe('wireless-mouse');
  });

  it('transparently falls back to database if Redis throws errors', async () => {
    const brokenRedis = {
      get: vi.fn().mockRejectedValue(new Error('Connection lost')),
      set: vi.fn().mockRejectedValue(new Error('Connection lost')),
      del: vi.fn().mockRejectedValue(new Error('Connection lost')),
      keys: vi.fn().mockRejectedValue(new Error('Connection lost')),
    };

    const cache = new RedisCacheService(brokenRedis as never);
    let dbCallCount = 0;
    const loader = async () => {
      dbCallCount++;
      return { id: 'fallback-product', title: 'Resilient Product' };
    };

    // Cache error must not throw 500 or crash; it must transparently return loader result
    const result = await cache.getOrSet('cache:pdp:marketplace:resilient', 300, loader);
    expect(result.id).toBe('fallback-product');
    expect(dbCallCount).toBe(1);
  });

  it('getChannelProduct integrates with RedisCacheService against real database', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const storeId = await seedStore(sql, 'cache');
      const products = (await sql.unsafe(
        `INSERT INTO "products" ("store_id","slug","title","status","min_price_cents","currency")
         VALUES ($1,'t033-hot-product','Hot Product','active',4999,'USD') RETURNING "id";`,
        [storeId],
      )) as unknown as Array<{ id: string }>;
      await sql.unsafe(
        `INSERT INTO "product_publications" ("product_id","marketplace_enabled","store_enabled")
         VALUES ($1,true,true);`,
        [products[0]!.id],
      );

      const memoryStore = new Map<string, string>();
      let lockHolder: string | null = null;
      const testRedis = {
        get: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
        set: vi.fn(async (key: string, val: string, ...args: unknown[]) => {
          if (args[0] === 'EX' && args[2] === 'NX') {
            if (lockHolder) return null;
            lockHolder = key;
            return 'OK';
          }
          memoryStore.set(key, val);
          return 'OK';
        }),
        del: vi.fn(async (...keys: string[]) => {
          for (const k of keys) {
            if (lockHolder === k) lockHolder = null;
            memoryStore.delete(k);
          }
          return keys.length;
        }),
        keys: vi.fn(async (pattern: string) => {
          const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
          return Array.from(memoryStore.keys()).filter((k) => regex.test(k));
        }),
      };

      const cache = new RedisCacheService(testRedis as never);

      // Concurrent reads
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          getChannelProduct(
            { channel: 'marketplace', productSlug: 't033-hot-product' },
            sql,
            cache,
          ),
        ),
      );

      expect(results.length).toBe(10);
      expect(results[0]?.title).toBe('Hot Product');
      expect(results[0]?.priceCents).toBe(4999);

      // Redis get was called
      expect(testRedis.get).toHaveBeenCalled();
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
