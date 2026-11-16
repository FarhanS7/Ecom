import { describe, expect, it } from 'vitest';
import {
  OPENSEARCH_INDEX_NAME,
  buildAutocompleteQuery,
  buildOpenSearchQuery,
  getOpenSearchIndexMapping,
} from './opensearch-query-builder.js';

describe('OpenSearch Query Builder & Index Mappings (TASK-081)', () => {
  it('defines correct index mappings with edge_ngram and english analyzers', () => {
    expect(OPENSEARCH_INDEX_NAME).toBe('shopscale_products');
    const indexDef = getOpenSearchIndexMapping();

    // Verify analysis settings
    const settings = indexDef.settings as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
    expect(settings['analysis']?.['filter']?.['edge_ngram_filter']).toEqual({
      type: 'edge_ngram',
      min_gram: 2,
      max_gram: 20,
    });
    expect(settings['analysis']?.['analyzer']?.['autocomplete_index']?.['filter']).toContain('edge_ngram_filter');
    expect(settings['analysis']?.['analyzer']?.['english_stemmed']?.['filter']).toContain('english_stemmer');

    // Verify property types
    const props = (indexDef.mappings as { properties: Record<string, { type: string; fields?: Record<string, { analyzer?: string }> }> }).properties;
    expect(props['productId']?.type).toBe('keyword');
    expect(props['title']?.type).toBe('text');
    expect(props['title']?.fields?.['autocomplete']?.analyzer).toBe('autocomplete_index');
    expect(props['title']?.fields?.['english']?.analyzer).toBe('english_stemmed');
    expect(props['minPriceCents']?.type).toBe('integer');
    expect(props['brand']?.type).toBe('keyword');
  });

  describe('buildOpenSearchQuery', () => {
    it('constructs marketplace query with text search, fuzziness, and facet aggregations', () => {
      const dsl = buildOpenSearchQuery('wireless headphone', {
        channel: 'marketplace',
        brand: 'Sony',
        minPriceCents: 5000,
        maxPriceCents: 20000,
      }, { limit: 15, sort: 'price_asc' }) as {
        size: number;
        query: {
          bool: {
            must: { multi_match?: { query: string; fuzziness: string; fields: string[] } };
            filter: Array<Record<string, unknown>>;
          };
        };
        sort: Array<Record<string, string>>;
        aggs: {
          brands: { terms: { field: string } };
          categories: { terms: { field: string } };
          price_ranges: { range: { field: string } };
        };
      };

      expect(dsl.size).toBe(15);

      // Must have bool query
      const bool = dsl.query.bool;
      expect(bool.must.multi_match).toBeDefined();
      expect(bool.must.multi_match?.query).toBe('wireless headphone');
      expect(bool.must.multi_match?.fuzziness).toBe('AUTO');
      expect(bool.must.multi_match?.fields).toContain('title^3');

      // Filters
      expect(bool.filter).toContainEqual({ term: { visibility: true } });
      expect(bool.filter).toContainEqual({ term: { marketplaceEnabled: true } });
      expect(bool.filter).toContainEqual({ term: { brand: 'Sony' } });
      expect(bool.filter).toContainEqual({
        range: { minPriceCents: { gte: 5000, lte: 20000 } },
      });

      // Sort
      expect(dsl.sort).toEqual([
        { minPriceCents: 'asc' },
        { productId: 'asc' },
      ]);

      // Facet Aggregations
      expect(dsl.aggs.brands.terms.field).toBe('brand');
      expect(dsl.aggs.categories.terms.field).toBe('categoryId');
      expect(dsl.aggs.price_ranges.range.field).toBe('minPriceCents');
    });

    it('constructs store-scoped browse query without search keywords', () => {
      const storeId = 'store-uuid-123';
      const dsl = buildOpenSearchQuery(undefined, {
        channel: 'store',
        storeId,
      }, { sort: 'popularity' }) as {
        query: {
          bool: {
            must: Record<string, unknown>;
            filter: Array<Record<string, unknown>>;
          };
        };
        sort: Array<Record<string, string>>;
      };

      const bool = dsl.query.bool;
      expect(bool.must).toEqual({ match_all: {} });
      expect(bool.filter).toContainEqual({ term: { storeId } });
      expect(bool.filter).toContainEqual({ term: { storeEnabled: true } });
      expect(dsl.sort).toEqual([
        { salesCount: 'desc' },
        { productId: 'desc' },
      ]);
    });
  });

  describe('buildAutocompleteQuery', () => {
    it('constructs edge_ngram prefix autocomplete query with source projection', () => {
      const dsl = buildAutocompleteQuery('keyb', {
        channel: 'marketplace',
        limit: 5,
      }) as {
        size: number;
        _source: string[];
        query: {
          bool: {
            must: { match: Record<string, { query: string; operator: string }> };
            filter: Array<Record<string, unknown>>;
          };
        };
      };

      expect(dsl.size).toBe(5);
      expect(dsl._source).toEqual(['productId', 'title', 'brand', 'minPriceCents']);
      expect(dsl.query.bool.must.match['title.autocomplete']).toEqual({
        query: 'keyb',
        operator: 'and',
      });
      expect(dsl.query.bool.filter).toContainEqual({ term: { marketplaceEnabled: true } });
    });
  });
});
