// @shopscale/backend/search/autocomplete.service - Sub-50ms autocomplete suggestions (T032).
// Invariants:
// 1. Channel isolation: marketplace searches only marketplace_enabled; store searches scope to storeId.
// 2. High-speed prefix / trigram matching bounded to top 6 suggestions.
// 3. Import-safe: lazily accesses database connection.

import type { SqlClient } from '../platform/index.js';
import { getDb } from '../db/client.js';
import { sanitizeSearchQuery } from './query-parser.js';

export interface AutocompleteSuggestion {
  type: 'product' | 'category';
  text: string;
  slug: string;
  priceCents?: number | undefined;
}

export interface AutocompleteOptions {
  channel?: 'marketplace' | 'store' | undefined;
  storeId?: string | undefined;
  limit?: number | undefined;
}

export class AutocompleteService {
  constructor(private readonly sqlClient?: SqlClient) {}

  private get sql(): SqlClient {
    return this.sqlClient ?? getDb();
  }

  /**
   * Fast autocomplete returning product titles and categories matching user input.
   */
  async suggest(
    rawQuery: string,
    options: AutocompleteOptions = {},
  ): Promise<AutocompleteSuggestion[]> {
    const sanitized = sanitizeSearchQuery(rawQuery);
    if (!sanitized || sanitized.length < 2) {
      return [];
    }

    const limit = Math.min(Math.max(options.limit ?? 6, 1), 10);
    const channel = options.channel ?? 'marketplace';
    const prefixPattern = `${sanitized}%`;

    const whereClauses: string[] = ['"visibility" = true'];
    const params: unknown[] = [];

    if (channel === 'store' && options.storeId) {
      params.push(options.storeId);
      whereClauses.push(`"store_id" = $${params.length}`);
      whereClauses.push('"store_enabled" = true');
    } else {
      whereClauses.push('"marketplace_enabled" = true');
    }

    // Product suggestions
    params.push(prefixPattern, sanitized, limit);
    const prodParams = params;
    const prefixIdx = prodParams.length - 2;
    const termIdx = prodParams.length - 1;
    const limitIdx = prodParams.length;

    const prodSql = `
      SELECT
        p."title",
        p."min_price_cents",
        prod."slug"
      FROM "search_documents" p
      JOIN "products" prod ON prod."id" = p."product_id"
      WHERE ${whereClauses.join(' AND ')}
        AND (p."title" ILIKE $${prefixIdx} OR similarity(p."title", $${termIdx}) > 0.2)
      ORDER BY
        CASE WHEN p."title" ILIKE $${prefixIdx} THEN 0 ELSE 1 END,
        similarity(p."title", $${termIdx}) DESC,
        p."sales_count" DESC
      LIMIT $${limitIdx};
    `;

    const productRows = (await this.sql.unsafe(
      prodSql,
      prodParams as never[],
    )) as unknown as Array<{ title: string; min_price_cents: string | number; slug: string }>;

    const suggestions: AutocompleteSuggestion[] = productRows.map((r) => ({
      type: 'product',
      text: r.title,
      slug: r.slug,
      priceCents: Number(r.min_price_cents),
    }));

    // If slots remain, add category suggestions matching prefix
    if (suggestions.length < limit) {
      const remaining = limit - suggestions.length;
      const catRows = (await this.sql.unsafe(
        `SELECT "name", "slug"
         FROM "categories"
         WHERE "name" ILIKE $1
         LIMIT $2;`,
        [prefixPattern, remaining],
      )) as unknown as Array<{ name: string; slug: string }>;

      for (const cat of catRows) {
        suggestions.push({
          type: 'category',
          text: cat.name,
          slug: cat.slug,
        });
      }
    }

    return suggestions.slice(0, limit);
  }
}

export const autocompleteService = new AutocompleteService();
