// @shopscale/backend/search/postgres.adapter - PostgreSQL FTS SearchPort implementation (TASK-081, DEC-007).

import type { SqlClient } from '../platform/index.js';
import { getDb } from '../db/client.js';
import { SearchQueryService } from './query.service.js';
import { AutocompleteService } from './autocomplete.service.js';
import type { SearchFilters, SearchOptions, SearchResult } from './query.service.js';
import type { AutocompleteOptions, AutocompleteSuggestion } from './autocomplete.service.js';
import type { SearchDocumentInput, SearchPort } from './search.port.js';

export class PostgresSearchAdapter implements SearchPort {
  private readonly queryService: SearchQueryService;
  private readonly autocompleteService: AutocompleteService;

  constructor(private readonly sqlClient?: SqlClient) {
    this.queryService = new SearchQueryService(this.sqlClient);
    this.autocompleteService = new AutocompleteService(this.sqlClient);
  }

  private get sql(): SqlClient {
    return this.sqlClient ?? getDb();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.sql`SELECT 1;`;
      return true;
    } catch {
      return false;
    }
  }

  async search(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {},
  ): Promise<SearchResult> {
    return this.queryService.search(query, filters, options);
  }

  async suggest(
    prefix: string,
    options: AutocompleteOptions = {},
  ): Promise<AutocompleteSuggestion[]> {
    return this.autocompleteService.suggest(prefix, options);
  }

  async indexDocument(doc: SearchDocumentInput): Promise<void> {
    await this.sql`
      INSERT INTO "search_documents" (
        "product_id", "store_id", "title", "description", "brand",
        "category_id", "category_path", "min_price_cents", "currency",
        "rating_avg", "rating_count", "sales_count", "visibility",
        "marketplace_enabled", "store_enabled", "tsv", "updated_at"
      ) VALUES (
        ${doc.productId},
        ${doc.storeId},
        ${doc.title},
        ${doc.description},
        ${doc.brand},
        ${doc.categoryId ?? null},
        ${doc.categoryPath ?? null},
        ${doc.minPriceCents},
        ${doc.currency},
        ${doc.ratingAvg ?? 0},
        ${doc.ratingCount ?? 0},
        ${doc.salesCount ?? 0},
        ${doc.visibility ?? true},
        ${doc.marketplaceEnabled ?? true},
        ${doc.storeEnabled ?? true},
        setweight(to_tsvector('english', ${doc.title}), 'A') ||
        setweight(to_tsvector('english', COALESCE(${doc.brand}, '')), 'B') ||
        setweight(to_tsvector('english', ${doc.description}), 'C'),
        NOW()
      )
      ON CONFLICT ("product_id") DO UPDATE SET
        "title" = EXCLUDED."title",
        "description" = EXCLUDED."description",
        "brand" = EXCLUDED."brand",
        "category_id" = EXCLUDED."category_id",
        "category_path" = EXCLUDED."category_path",
        "min_price_cents" = EXCLUDED."min_price_cents",
        "currency" = EXCLUDED."currency",
        "rating_avg" = EXCLUDED."rating_avg",
        "rating_count" = EXCLUDED."rating_count",
        "sales_count" = EXCLUDED."sales_count",
        "visibility" = EXCLUDED."visibility",
        "marketplace_enabled" = EXCLUDED."marketplace_enabled",
        "store_enabled" = EXCLUDED."store_enabled",
        "tsv" = EXCLUDED."tsv",
        "updated_at" = NOW();
    `;
  }

  async indexBulk(docs: SearchDocumentInput[]): Promise<void> {
    for (const doc of docs) {
      await this.indexDocument(doc);
    }
  }

  async deleteDocument(productId: string): Promise<void> {
    await this.sql`
      DELETE FROM "search_documents" WHERE "product_id" = ${productId};
    `;
  }
}
