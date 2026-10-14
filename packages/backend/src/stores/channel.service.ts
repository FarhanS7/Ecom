// @shopscale/backend/stores/channel.service - Trusted storefront resolution.
// The channel ALWAYS derives from the path on the server: slugs resolve to
// ACTIVE approved stores; unknown, malformed, pending, or suspended slugs
// resolve to null (storefront unavailable). Bodies never select stores.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { getTheme } from './theme.service.js';
import type { ThemeTokens } from './theme.service.js';

export interface StorefrontChannel {
  channel: 'store';
  storeId: string;
  slug: string;
  name: string;
  theme: ThemeTokens;
}

const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;

export function extractStoreSlug(path: string): string | null {
  const match = path.match(/^\/stores\/([^/?#]+)/);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1] as string);
  } catch {
    return null;
  }
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/** Resolve an ACTIVE storefront by slug, with its validated theme. */
export async function resolveStorefront(
  slug: string,
  sql: Sql = getDb(),
): Promise<StorefrontChannel | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const rows = (await sql.unsafe(
    `SELECT "id","slug","name" FROM "stores" WHERE "slug" = $1 AND "status" = 'active';`,
    [slug],
  )) as unknown as Array<{ id: string; slug: string; name: string }>;
  const store = rows[0];
  if (!store) return null;
  const theme = await getTheme(store.id, sql);
  return { channel: 'store', storeId: store.id, slug: store.slug, name: store.name, theme };
}
