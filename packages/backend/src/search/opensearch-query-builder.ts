// @shopscale/backend/search/opensearch-query-builder - Query DSL & index schema for OpenSearch (TASK-081).

import type { SearchFilters, SearchOptions } from './query.service.js';
import type { AutocompleteOptions } from './autocomplete.service.js';

export const OPENSEARCH_INDEX_NAME = 'shopscale_products';

export interface OpenSearchIndexDefinition {
  settings: Record<string, unknown>;
  mappings: Record<string, unknown>;
}

/**
 * Returns the OpenSearch index mapping and analysis configuration.
 * Configures edge_ngram analyzer for sub-50ms autocomplete and standard english stemmer for search.
 */
export function getOpenSearchIndexMapping(): OpenSearchIndexDefinition {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      analysis: {
        filter: {
          edge_ngram_filter: {
            type: 'edge_ngram',
            min_gram: 2,
            max_gram: 20,
          },
          english_stop: {
            type: 'stop',
            stopwords: '_english_',
          },
          english_stemmer: {
            type: 'stemmer',
            language: 'english',
          },
        },
        analyzer: {
          autocomplete_index: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'edge_ngram_filter'],
          },
          autocomplete_search: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase'],
          },
          english_stemmed: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'english_stop', 'english_stemmer'],
          },
        },
      },
    },
    mappings: {
      properties: {
        productId: { type: 'keyword' },
        storeId: { type: 'keyword' },
        title: {
          type: 'text',
          fields: {
            english: { type: 'text', analyzer: 'english_stemmed' },
            autocomplete: {
              type: 'text',
              analyzer: 'autocomplete_index',
              search_analyzer: 'autocomplete_search',
            },
            keyword: { type: 'keyword' },
          },
        },
        description: {
          type: 'text',
          fields: {
            english: { type: 'text', analyzer: 'english_stemmed' },
          },
        },
        brand: { type: 'keyword' },
        categoryId: { type: 'keyword' },
        categoryPath: { type: 'keyword' },
        minPriceCents: { type: 'integer' },
        currency: { type: 'keyword' },
        ratingAvg: { type: 'float' },
        ratingCount: { type: 'integer' },
        salesCount: { type: 'integer' },
        visibility: { type: 'boolean' },
        marketplaceEnabled: { type: 'boolean' },
        storeEnabled: { type: 'boolean' },
        createdAt: { type: 'date' },
      },
    },
  };
}

/**
 * Builds OpenSearch query DSL from high-level search arguments.
 */
export function buildOpenSearchQuery(
  rawQuery?: string,
  filters: SearchFilters = {},
  options: SearchOptions = {},
): Record<string, unknown> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const q = rawQuery?.trim() ?? '';
  const channel = filters.channel ?? 'marketplace';

  const filterClauses: Array<Record<string, unknown>> = [
    { term: { visibility: true } },
  ];

  if (channel === 'store' && filters.storeId) {
    filterClauses.push({ term: { storeId: filters.storeId } });
    filterClauses.push({ term: { storeEnabled: true } });
  } else {
    filterClauses.push({ term: { marketplaceEnabled: true } });
  }

  if (filters.brand) {
    filterClauses.push({ term: { brand: filters.brand } });
  }

  if (filters.categoryId) {
    filterClauses.push({ term: { categoryId: filters.categoryId } });
  } else if (filters.categoryPath) {
    filterClauses.push({ prefix: { categoryPath: filters.categoryPath } });
  }

  if (filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined) {
    const range: Record<string, number> = {};
    if (filters.minPriceCents !== undefined) range['gte'] = filters.minPriceCents;
    if (filters.maxPriceCents !== undefined) range['lte'] = filters.maxPriceCents;
    filterClauses.push({ range: { minPriceCents: range } });
  }

  let queryClause: Record<string, unknown>;
  if (q.length > 0) {
    queryClause = {
      multi_match: {
        query: q,
        fields: ['title^3', 'title.english^2', 'brand^2', 'description.english'],
        fuzziness: 'AUTO',
        prefix_length: 1,
      },
    };
  } else {
    queryClause = { match_all: {} };
  }

  const sortClauses: Array<Record<string, string>> = [];
  if (options.sort === 'price_asc') {
    sortClauses.push({ minPriceCents: 'asc' }, { productId: 'asc' });
  } else if (options.sort === 'price_desc') {
    sortClauses.push({ minPriceCents: 'desc' }, { productId: 'desc' });
  } else if (options.sort === 'popularity') {
    sortClauses.push({ salesCount: 'desc' }, { productId: 'desc' });
  } else if (options.sort === 'newest') {
    sortClauses.push({ createdAt: 'desc' }, { productId: 'desc' });
  } else if (q.length > 0) {
    sortClauses.push({ _score: 'desc' }, { productId: 'desc' });
  } else {
    sortClauses.push({ createdAt: 'desc' }, { productId: 'desc' });
  }

  return {
    size: limit,
    query: {
      bool: {
        must: queryClause,
        filter: filterClauses,
      },
    },
    sort: sortClauses,
    aggs: {
      brands: {
        terms: { field: 'brand', size: 30 },
      },
      categories: {
        terms: { field: 'categoryId', size: 30 },
      },
      price_ranges: {
        range: {
          field: 'minPriceCents',
          ranges: [
            { key: 'under-25', to: 2500 },
            { key: '25-to-50', from: 2500, to: 5000 },
            { key: '50-to-100', from: 5000, to: 10000 },
            { key: 'over-100', from: 10000 },
          ],
        },
      },
    },
  };
}

/**
 * Builds OpenSearch query DSL for autocomplete suggestions using edge_ngram.
 */
export function buildAutocompleteQuery(
  prefix: string,
  options: AutocompleteOptions = {},
): Record<string, unknown> {
  const limit = Math.min(Math.max(options.limit ?? 6, 1), 10);
  const channel = options.channel ?? 'marketplace';

  const filterClauses: Array<Record<string, unknown>> = [
    { term: { visibility: true } },
  ];

  if (channel === 'store' && options.storeId) {
    filterClauses.push({ term: { storeId: options.storeId } });
    filterClauses.push({ term: { storeEnabled: true } });
  } else {
    filterClauses.push({ term: { marketplaceEnabled: true } });
  }

  return {
    size: limit,
    _source: ['productId', 'title', 'brand', 'minPriceCents'],
    query: {
      bool: {
        must: {
          match: {
            'title.autocomplete': {
              query: prefix,
              operator: 'and',
            },
          },
        },
        filter: filterClauses,
      },
    },
  };
}
