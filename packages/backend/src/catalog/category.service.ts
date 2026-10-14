// @shopscale/backend/catalog/category.service - Category tree with cycle
// rejection (T019b). Paths are materialized ('/root/child/') and maintained
// on re-parent by a single subtree UPDATE — the same transaction that moves
// the node, so readers never see a half-rewritten tree.
//
// Cycle rejection is NOT read-then-check: the parent chain walk happens
// inside the transaction WHILE holding a transaction-scoped advisory lock on
// category re-parenting, so two racing re-parents (A under B, B under A)
// serialize and the second one observes the cycle. The self-loop case is
// additionally rejected by a DB CHECK (0006-catalog.sql).

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import type { Queryable } from '../identity/auth.service.js';

export type CategoryFailure = 'NOT_FOUND' | 'CATEGORY_CYCLE' | 'CONFLICT';

export class CategoryError extends Error {
  readonly failure: CategoryFailure;

  constructor(failure: CategoryFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

/** Serializes category re-parenting DB-wide (tx-scoped, released at commit). */
const REPARENT_LOCK_KEY = 74_019;

/** Deep-tree guard: real catalogs are shallow; a longer chain is hostile. */
const MAX_ANCESTOR_DEPTH = 64;

export interface CategoryInput {
  slug: string;
  name: string;
  parentId?: string | null;
}

export interface Category {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  path: string;
}

/** Pure: full path for a child of `parentPath` ('/' for roots). */
export function buildCategoryPath(parentPath: string | null, slug: string): string {
  if (parentPath === null) return `/${slug}/`;
  return `${parentPath}${slug}/`;
}

/** Pure: does the walked ancestor chain contain the node being moved? */
export function chainContains(ancestors: readonly string[], movingId: string): boolean {
  return ancestors.includes(movingId);
}

function toCategory(row: { id: string; parent_id: string | null; slug: string; name: string; path: string }): Category {
  return { id: row.id, parentId: row.parent_id, slug: row.slug, name: row.name, path: row.path };
}

async function readCategory(tx: Queryable, id: string): Promise<Category> {
  const rows = (await tx.unsafe(
    `SELECT "id","parent_id","slug","name","path" FROM "categories" WHERE "id" = $1;`,
    [id],
  )) as unknown as Array<{ id: string; parent_id: string | null; slug: string; name: string; path: string }>;
  const row = rows[0];
  if (!row) throw new CategoryError('NOT_FOUND', 'Category not found.');
  return toCategory(row);
}

/** Walk parent_id links from `startId` to the root; throws past the guard. */
async function ancestorChain(tx: Queryable, startId: string): Promise<string[]> {
  const chain: string[] = [];
  let cursor: string | null = startId;
  while (cursor !== null) {
    chain.push(cursor);
    if (chain.length > MAX_ANCESTOR_DEPTH) {
      throw new CategoryError('CATEGORY_CYCLE', 'Category ancestry exceeds the depth guard.');
    }
    const rows = (await tx.unsafe(`SELECT "parent_id" FROM "categories" WHERE "id" = $1;`, [cursor])) as unknown as Array<{
      parent_id: string | null;
    }>;
    cursor = rows[0]?.parent_id ?? null;
  }
  return chain;
}

export async function createCategory(input: CategoryInput, sql: Sql = getDb()): Promise<Category> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock($1);`, [REPARENT_LOCK_KEY]);
    let parentPath: string | null = null;
    if (input.parentId) {
      parentPath = (await readCategory(tx, input.parentId)).path;
    }
    const path = buildCategoryPath(parentPath, input.slug);
    const rows = (await tx.unsafe(
      `INSERT INTO "categories" ("parent_id","slug","name","path") VALUES ($1,$2,$3,$4)
       RETURNING "id","parent_id","slug","name","path";`,
      [input.parentId ?? null, input.slug, input.name, path],
    )) as unknown as Array<{ id: string; parent_id: string | null; slug: string; name: string; path: string }>;
    const row = rows[0];
    if (!row) throw new Error('Category insert returned no row.');
    return toCategory(row);
  });
}

export async function reparentCategory(
  categoryId: string,
  newParentId: string | null,
  sql: Sql = getDb(),
): Promise<Category> {
  return sql.begin(async (tx) => {
    // Global re-parent lock: the ancestor walk below is then race-free
    // against any concurrent re-parent, not just per-node (a per-node lock
    // cannot order two moves that reference each other).
    await tx.unsafe(`SELECT pg_advisory_xact_lock($1);`, [REPARENT_LOCK_KEY]);

    const moving = await readCategory(tx, categoryId);

    let newParentPath: string | null = null;
    if (newParentId !== null) {
      if (newParentId === categoryId) {
        throw new CategoryError('CATEGORY_CYCLE', 'A category cannot be its own parent.');
      }
      const chain = await ancestorChain(tx, newParentId);
      if (chainContains(chain, categoryId)) {
        throw new CategoryError('CATEGORY_CYCLE', 'Re-parenting would create a cycle.');
      }
      newParentPath = (await readCategory(tx, newParentId)).path;
    }

    const newPath = buildCategoryPath(newParentPath, moving.slug);
    if (newPath === moving.path && (newParentId ?? null) === moving.parentId) {
      return moving; // no-op move
    }

    await tx.unsafe(`UPDATE "categories" SET "parent_id" = $1, "path" = $2, "slug" = $3 WHERE "id" = $4;`, [
      newParentId,
      newPath,
      moving.slug,
      categoryId,
    ]);
    // One statement rewrites the whole subtree prefix; descendants keep
    // their relative depth because their paths start with the old prefix.
    await tx.unsafe(
      `UPDATE "categories" SET "path" = $2 || substring("path" from length($1) + 1)
       WHERE "path" LIKE $1 || '%';`,
      [moving.path, newPath],
    );
    return readCategory(tx, categoryId);
  });
}

/** Delete relies on RESTRICT FKs: children or products still attached →
 * the database refuses, and the constraint error surfaces as CONFLICT. */
export async function deleteCategory(categoryId: string, sql: Sql = getDb()): Promise<void> {
  try {
    await sql.unsafe(`DELETE FROM "categories" WHERE "id" = $1;`, [categoryId]);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('product') || message.includes('categories')) {
      throw new CategoryError('CONFLICT', 'Category still has children or products.');
    }
    throw err;
  }
}

export async function listCategories(sql: Sql = getDb()): Promise<Category[]> {
  const rows = (await sql.unsafe(
    `SELECT "id","parent_id","slug","name","path" FROM "categories" ORDER BY "path","id";`,
  )) as unknown as Array<{ id: string; parent_id: string | null; slug: string; name: string; path: string }>;
  return rows.map(toCategory);
}
