// @shopscale/backend/search/opensearch.adapter - OpenSearch 8 SearchPort implementation (TASK-081, DEC-007).
// Connects to OpenSearch over standard HTTP/REST.

import type { AutocompleteOptions, AutocompleteSuggestion } from './autocomplete.service.js';
import type {
  FacetCount,
  SearchFilters,
  SearchOptions,
  SearchResult,
  SearchResultItem,
} from './query.service.js';
import type { SearchDocumentInput, SearchPort } from './search.port.js';
import {
  OPENSEARCH_INDEX_NAME,
  buildAutocompleteQuery,
  buildOpenSearchQuery,
  getOpenSearchIndexMapping,
} from './opensearch-query-builder.js';

export interface OpenSearchAdapterOptions {
  baseUrl?: string | undefined;
  indexName?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export class OpenSearchSearchAdapter implements SearchPort {
  private readonly baseUrl: string;
  private readonly indexName: string;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenSearchAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env['OPENSEARCH_URL'] ?? 'http://127.0.0.1:9200').replace(/\/+$/, '');
    this.indexName = options.indexName ?? OPENSEARCH_INDEX_NAME;
    this.fetcher = options.fetchFn ?? globalThis.fetch;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetcher(`${this.baseUrl}/_cluster/health`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async ensureIndex(): Promise<void> {
    try {
      const existsRes = await this.fetcher(`${this.baseUrl}/${this.indexName}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      if (existsRes.status === 200) {
        return;
      }
    } catch {
      // Proceed to create
    }

    const mapping = getOpenSearchIndexMapping();
    const createRes = await this.fetcher(`${this.baseUrl}/${this.indexName}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(mapping),
      signal: AbortSignal.timeout(10000),
    });

    if (!createRes.ok && createRes.status !== 400) {
      const text = await createRes.text();
      throw new Error(`Failed to create OpenSearch index "${this.indexName}": ${text}`);
    }
  }

  async search(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {},
  ): Promise<SearchResult> {
    const dsl = buildOpenSearchQuery(query, filters, options);
    const res = await this.fetcher(`${this.baseUrl}/${this.indexName}/_search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(dsl),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenSearch search query failed with status ${res.status}: ${errorText}`);
    }

    const body = (await res.json()) as {
      hits?: {
        total?: { value?: number } | number;
        hits?: Array<{
          _id: string;
          _source: Record<string, unknown>;
        }>;
      };
      aggregations?: {
        brands?: { buckets?: Array<{ key: string; doc_count: number }> };
        categories?: { buckets?: Array<{ key: string; doc_count: number }> };
        price_ranges?: { buckets?: Array<{ key: string; doc_count: number }> };
      };
    };

    const rawHits = body.hits?.hits ?? [];
    const totalHits =
      typeof body.hits?.total === 'number'
        ? body.hits.total
        : body.hits?.total?.value ?? rawHits.length;

    const items: SearchResultItem[] = rawHits.map((h) => {
      const src = h._source;
      return {
        id: (src['productId'] as string) ?? h._id,
        productId: (src['productId'] as string) ?? h._id,
        storeId: (src['storeId'] as string) ?? '',
        title: (src['title'] as string) ?? '',
        description: (src['description'] as string) ?? '',
        brand: (src['brand'] as string | null) ?? null,
        priceCents: Number(src['minPriceCents'] ?? 0),
        currency: (src['currency'] as string) ?? 'USD',
        ratingAvg: Number(src['ratingAvg'] ?? 0),
        ratingCount: Number(src['ratingCount'] ?? 0),
        salesCount: Number(src['salesCount'] ?? 0),
      };
    });

    const brands: FacetCount[] = (body.aggregations?.brands?.buckets ?? []).map((b) => ({
      value: b.key,
      count: b.doc_count,
    }));

    const categories: FacetCount[] = (body.aggregations?.categories?.buckets ?? []).map((b) => ({
      value: b.key,
      count: b.doc_count,
    }));

    const priceRanges: FacetCount[] = (body.aggregations?.price_ranges?.buckets ?? []).map((b) => ({
      value: b.key,
      count: b.doc_count,
    }));

    const nextCursor = items.length > 0 && items.length < totalHits ? items[items.length - 1]!.id : null;

    return {
      items,
      facets: {
        brands,
        categories,
        priceRanges,
      },
      totalHits,
      nextCursor,
      fallbackUsed: false,
    };
  }

  async suggest(
    prefix: string,
    options: AutocompleteOptions = {},
  ): Promise<AutocompleteSuggestion[]> {
    const dsl = buildAutocompleteQuery(prefix, options);
    const res = await this.fetcher(`${this.baseUrl}/${this.indexName}/_search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(dsl),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return [];
    }

    const body = (await res.json()) as {
      hits?: {
        hits?: Array<{
          _id: string;
          _source: Record<string, unknown>;
        }>;
      };
    };

    const hits = body.hits?.hits ?? [];
    return hits.map((h) => {
      const src = h._source;
      return {
        type: 'product',
        text: (src['title'] as string) ?? '',
        slug: (src['productId'] as string) ?? h._id,
        priceCents: typeof src['minPriceCents'] === 'number' ? src['minPriceCents'] : undefined,
      };
    });
  }

  async indexDocument(doc: SearchDocumentInput): Promise<void> {
    const res = await this.fetcher(
      `${this.baseUrl}/${this.indexName}/_doc/${encodeURIComponent(doc.productId)}`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          ...doc,
          createdAt: doc.createdAt ?? new Date().toISOString(),
          visibility: doc.visibility ?? true,
          marketplaceEnabled: doc.marketplaceEnabled ?? true,
          storeEnabled: doc.storeEnabled ?? true,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to index document "${doc.productId}": ${errorText}`);
    }
  }

  async indexBulk(docs: SearchDocumentInput[]): Promise<void> {
    if (docs.length === 0) return;

    let ndjson = '';
    for (const doc of docs) {
      const action = JSON.stringify({
        index: {
          _index: this.indexName,
          _id: doc.productId,
        },
      });
      const source = JSON.stringify({
        ...doc,
        createdAt: doc.createdAt ?? new Date().toISOString(),
        visibility: doc.visibility ?? true,
        marketplaceEnabled: doc.marketplaceEnabled ?? true,
        storeEnabled: doc.storeEnabled ?? true,
      });
      ndjson += `${action}\n${source}\n`;
    }

    const res = await this.fetcher(`${this.baseUrl}/_bulk`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-ndjson',
        accept: 'application/json',
      },
      body: ndjson,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenSearch _bulk indexing failed: ${errorText}`);
    }
  }

  async deleteDocument(productId: string): Promise<void> {
    const res = await this.fetcher(
      `${this.baseUrl}/${this.indexName}/_doc/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok && res.status !== 404) {
      const errorText = await res.text();
      throw new Error(`Failed to delete document "${productId}": ${errorText}`);
    }
  }
}
