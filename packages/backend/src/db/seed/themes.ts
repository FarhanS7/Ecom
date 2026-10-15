// @shopscale/backend/db/seed/themes - T028b theme + storefront content.
//
// Theme tokens are a CLOSED set (T016): six hex colours and an integer radius,
// rejecting anything else at the boundary. The seed therefore validates every
// row it plans with the SAME contract the read path uses, instead of trusting
// hand-written objects — a seeded theme that could not be rendered would make
// the storefront look broken for reasons that have nothing to do with the code.
//
// Each store gets a distinct accent so a storefront test can tell two stores
// apart by what it renders (and not merely by the URL it asked for).

import type { Sql } from 'postgres';
import { themeTokensSchema, type ThemeTokens } from '@shopscale/contracts';
import { insertChunked, orderedStores, type IdentityPlan } from './identity.js';
import { canonicalJson, isoAt, pick, seedRandom } from './random.js';
import type { CatalogPlan } from './catalog.js';

export interface SeedThemeRow {
  store_id: string;
  version: number;
  approved_tokens: ThemeTokens;
  updated_at: string;
}

export interface SeedContentRow {
  store_id: string;
  version: number;
  featured_ids: string[];
  headline: string | null;
  socials: Record<string, unknown>;
  swatches: Record<string, unknown>;
  updated_at: string;
}

export interface ThemePlan {
  themes: SeedThemeRow[];
  content: SeedContentRow[];
}

/** Six passes for the six-accent palette below (palette index = store index). */
const ACCENTS = ['#e94560', '#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#00b8a9'] as const;
const PRIMARIES = ['#1a1a2e', '#16213e', '#1f2d3d', '#2b2118', '#20242b', '#0f2027'] as const;

function themeFor(index: number): ThemeTokens {
  return themeTokensSchema.parse({
    primary: pick(seedRandom(index + 1), PRIMARIES),
    background: '#ffffff',
    surface: '#f8f9fa',
    text: '#1a1a2e',
    muted: '#6a737d',
    accent: ACCENTS[index % ACCENTS.length],
    radius: 6 + (index % 6),
  });
}

/**
 * Themes and homepage content per store. `featured_ids` are taken from THAT
 * store's own visible products (never another store's), and the empty store gets
 * none — which is what makes the storefront's empty state real rather than forced.
 */
export function planThemes(identity: IdentityPlan, catalog: CatalogPlan): ThemePlan {
  const themes: SeedThemeRow[] = [];
  const content: SeedContentRow[] = [];

  for (const store of orderedStores(identity)) {
    const catalogStore = catalog.stores.find((item) => item.storeId === store.storeId);
    const visible = catalogStore?.storeProductIds ?? [];
    // Up to four featured products, spread across the catalog rather than the
    // first four, so the homepage does not look like a prefix of the listing.
    const stride = Math.max(1, Math.floor(visible.length / 4));
    const featured = visible.filter((_, index) => index % stride === 0).slice(0, 4);

    themes.push({
      store_id: store.storeId,
      version: 1,
      approved_tokens: themeFor(store.index),
      updated_at: isoAt(15 * store.index),
    });

    content.push({
      store_id: store.storeId,
      version: 1,
      featured_ids: featured,
      headline: `${store.slug.replace(/^seed-/, 'Seed ')} — new season`,
      // T068 owns the socials/swatches write path; the seed does not invent a
      // shape for them ahead of the contract that will validate them.
      socials: {},
      swatches: {},
      updated_at: isoAt(16 * store.index),
    });
  }

  return { themes, content };
}

export interface ThemeWriteReport {
  theme: number;
  content: number;
}

/** Write themes/content (both keyed by store_id, one row per store). */
export async function writeThemes(sql: Sql, plan: ThemePlan): Promise<ThemeWriteReport> {
  const themes = await insertChunked(sql, {
    table: 'store_themes',
    columns: ['store_id', 'version', 'approved_tokens', 'updated_at'],
    casts: { approved_tokens: 'jsonb' },
    rows: plan.themes,
    valuesOf: (row) => {
      const item = row as SeedThemeRow;
      return [item.store_id, item.version, canonicalJson(item.approved_tokens), item.updated_at];
    },
  });

  const content = await insertChunked(sql, {
    table: 'store_content',
    columns: ['store_id', 'version', 'featured_ids', 'headline', 'socials', 'swatches', 'updated_at'],
    casts: { featured_ids: 'jsonb', socials: 'jsonb', swatches: 'jsonb' },
    rows: plan.content,
    valuesOf: (row) => {
      const item = row as SeedContentRow;
      return [
        item.store_id,
        item.version,
        canonicalJson(item.featured_ids),
        item.headline,
        canonicalJson(item.socials),
        canonicalJson(item.swatches),
        item.updated_at,
      ];
    },
  });

  return { theme: themes, content };
}
