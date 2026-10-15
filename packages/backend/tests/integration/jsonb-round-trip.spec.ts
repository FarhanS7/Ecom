// T028c finding: jsonb values were being written as JSON STRINGS.
//
// Every write path that passed `JSON.stringify(value)` as a parameter whose target
// column is jsonb was double-encoded: Postgres infers the parameter's type from the
// column, and the driver then JSON-encodes the value again, so the column ended up
// holding `"{\"a\":1}"` (a jsonb string) instead of `{"a":1}` (a jsonb object). The
// contracts require objects (`attributes: z.record(z.unknown())`, address `fields`),
// and no read path compensated, so the API returned strings.
//
// This spec pins the behaviour at the database boundary: whatever the write paths
// do, what lands in the column must be an object. It needs no HTTP layer and no
// Redis, so it runs wherever a database does. Skips honestly without one.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { createProduct, createVariant, getStoreProduct, updateProduct, updateVariant } from '../../src/catalog/product.service.js';
import { createAddress, listAddresses, updateAddress } from '../../src/identity/addresses.js';
import { recordAudit } from '../../src/platform/audit-port.js';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);
const EMAIL = 't028j.owner@example.com';
const SLUG = 't028j-store';

type Sql = NonNullable<Awaited<ReturnType<typeof connectOrSkip>>>;

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
  const stores = `(SELECT "id" FROM "stores" WHERE "slug" = '${SLUG}')`;
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "store_id" IN ${stores};`);
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "store_id" IN ${stores});`);
  await sql.unsafe(`DELETE FROM "products" WHERE "store_id" IN ${stores};`);
  await sql.unsafe(`DELETE FROM "audit_logs" WHERE "actor_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1);`, [EMAIL]);
  await sql.unsafe(`DELETE FROM "addresses" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1);`, [EMAIL]);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" = '${SLUG}';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1);`,
    [EMAIL],
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" = $1;`, [EMAIL]);
}

async function jsonbTypeOf(sql: Sql, query: string, args: unknown[] = []): Promise<string | undefined> {
  const rows = (await sql.unsafe(query, args as never[])) as unknown as Array<{ t: string }>;
  return rows[0]?.t;
}

describe('jsonb round-trip at the database boundary (T028c finding)', () => {
  it('stores jsonb columns as JSON values, never as JSON strings', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const user = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,'x','active') RETURNING "id";`,
        [EMAIL],
      )) as unknown as Array<{ id: string }>;
      const userId = user[0]!.id;
      const business = (await sql.unsafe(`INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`, [
        userId,
      ])) as unknown as Array<{ id: string }>;
      const store = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$2,'active') RETURNING "id";`,
        [business[0]!.id, SLUG],
      )) as unknown as Array<{ id: string }>;
      const storeId = store[0]!.id;

      // Products and variants: attributes.
      const product = await createProduct({
        storeId,
        categoryId: null,
        slug: 't028j-product',
        title: 'Probe',
        description: 'Probe',
        brand: null,
        attributes: { color: 'red', sizes: [1, 2] },
        currency: 'USD',
      });
      expect(product.attributes).toEqual({ color: 'red', sizes: [1, 2] });
      expect(await jsonbTypeOf(sql, `SELECT jsonb_typeof("attributes") AS t FROM "products" WHERE "id" = $1;`, [product.id])).toBe('object');

      const patched = await updateProduct({
        storeId,
        productId: product.id,
        expectedVersion: product.version,
        patch: { attributes: { color: 'blue' } },
      });
      expect(patched.attributes).toEqual({ color: 'blue' });

      const variant = await createVariant({
        productId: product.id,
        storeId,
        sku: 'T028J-1',
        priceCents: 1000,
        attributes: { size: 'M' },
      });
      expect(variant.attributes).toEqual({ size: 'M' });
      expect(await jsonbTypeOf(sql, `SELECT jsonb_typeof("attributes") AS t FROM "product_variants" WHERE "id" = $1;`, [variant.id])).toBe('object');

      const variantPatched = await updateVariant({
        storeId,
        productId: product.id,
        variantId: variant.id,
        // Variant writes are gated by the PRODUCT counter, so read the current
        // version rather than assuming how many writes have happened.
        expectedVersion: (await getStoreProduct(storeId, product.id)).version,
        patch: { attributes: { size: 'L' } },
      });
      expect(variantPatched.attributes).toEqual({ size: 'L' });

      // Addresses: fields.
      const address = await createAddress(userId, {
        label: 'Home',
        line1: '1 Test Street',
        line2: null,
        city: 'Testville',
        region: 'TS',
        postalCode: '12345',
        country: 'TS',
        phone: null,
      } as never);
      expect(typeof address.fields).toBe('object');
      expect(address.fields).toEqual(expect.objectContaining({ city: 'Testville' }));
      expect(await jsonbTypeOf(sql, `SELECT jsonb_typeof("fields") AS t FROM "addresses" WHERE "id" = $1;`, [address.id])).toBe('object');

      const listed = await listAddresses(userId);
      expect(typeof listed[0]?.fields).toBe('object');
      const updated = await updateAddress(userId, address.id, {
        label: 'Home',
        line1: '1 Test Street',
        line2: null,
        city: 'Otherville',
        region: 'TS',
        postalCode: '12345',
        country: 'TS',
        phone: null,
      } as never);
      expect(typeof updated?.fields).toBe('object');
      expect(updated?.fields).toEqual(expect.objectContaining({ city: 'Otherville' }));

      // Audit trail: redacted before/after.
      await recordAudit({
        actorId: userId,
        storeId,
        action: 'product.update',
        entityType: 'product',
        entityId: product.id,
        before: { title: 'Probe' },
        after: { title: 'Probe 2' },
        requestId: 't028j-request',
      });
      expect(await jsonbTypeOf(sql, `SELECT jsonb_typeof("redacted_before") AS t FROM "audit_logs" WHERE "request_id" = 't028j-request';`)).toBe('object');
      expect(await jsonbTypeOf(sql, `SELECT jsonb_typeof("redacted_after") AS t FROM "audit_logs" WHERE "request_id" = 't028j-request';`)).toBe('object');

      // And the jsonb operators actually work, which is what the string form broke:
      // an `->>` filter over attributes must match.
      const filtered = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "products" WHERE "store_id" = $1 AND "attributes"->>'color' = 'blue';`,
        [storeId],
      )) as unknown as Array<{ n: number }>;
      expect(filtered[0]?.n).toBe(1);
    } finally {
      await cleanup(sql);
      await sql.end();
      resetEnvCache();
    }
  });
});
