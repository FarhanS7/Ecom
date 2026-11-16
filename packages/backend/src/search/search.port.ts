// @shopscale/backend/search/search.port - Unified SearchPort interface (TASK-081, DEC-007).
// Guarantees 100% contract parity between PostgreSQL FTS and OpenSearch search adapters.

import type { SearchFilters, SearchOptions, SearchResult } from './query.service.js';
import type { AutocompleteOptions, AutocompleteSuggestion } from './autocomplete.service.js';

export interface SearchDocumentInput {
  productId: string;
  storeId: string;
  title: string;
  description: string;
  brand: string | null;
  categoryId?: string | null | undefined;
  categoryPath?: string | null | undefined;
  minPriceCents: number;
  currency: string;
  ratingAvg?: number | undefined;
  ratingCount?: number | undefined;
  salesCount?: number | undefined;
  visibility?: boolean | undefined;
  marketplaceEnabled?: boolean | undefined;
  storeEnabled?: boolean | undefined;
  createdAt?: string | Date | undefined;
}

export interface SearchPort {
  /** Search products with text query, filters, facet counts, and cursor pagination. */
  search(query: string, filters?: SearchFilters, options?: SearchOptions): Promise<SearchResult>;

  /** Fast prefix / n-gram autocomplete returning product titles and category suggestions. */
  suggest(prefix: string, options?: AutocompleteOptions): Promise<AutocompleteSuggestion[]>;

  /** Upsert a single document into the search engine index. */
  indexDocument(doc: SearchDocumentInput): Promise<void>;

  /** Bulk upsert a batch of documents into the search engine index. */
  indexBulk(docs: SearchDocumentInput[]): Promise<void>;

  /** Remove a product document by ID. */
  deleteDocument(productId: string): Promise<void>;

  /** Check if the search engine instance is reachable and healthy. */
  healthCheck(): Promise<boolean>;
}
