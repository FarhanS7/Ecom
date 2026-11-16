import { describe, expect, it } from 'vitest';
import {
  OpenSearchSearchAdapter,
  PostgresSearchAdapter,
  type SearchDocumentInput,
  type SearchPort,
} from '../../packages/backend/src/search/index.js';

describe('OpenSearch Adapter & SearchPort Parity (TASK-081, DEC-007)', () => {
  it('implements SearchPort interface identically to PostgresSearchAdapter', () => {
    const osAdapter: SearchPort = new OpenSearchSearchAdapter();
    const pgAdapter: SearchPort = new PostgresSearchAdapter();

    expect(typeof osAdapter.search).toBe('function');
    expect(typeof osAdapter.suggest).toBe('function');
    expect(typeof osAdapter.indexDocument).toBe('function');
    expect(typeof osAdapter.indexBulk).toBe('function');
    expect(typeof osAdapter.deleteDocument).toBe('function');
    expect(typeof osAdapter.healthCheck).toBe('function');

    expect(typeof pgAdapter.search).toBe('function');
    expect(typeof pgAdapter.suggest).toBe('function');
    expect(typeof pgAdapter.indexDocument).toBe('function');
    expect(typeof pgAdapter.indexBulk).toBe('function');
    expect(typeof pgAdapter.deleteDocument).toBe('function');
    expect(typeof pgAdapter.healthCheck).toBe('function');
  });

  describe('Protocol & Query Execution', () => {
    // Simulated in-memory OpenSearch HTTP store
    const store = new Map<string, Record<string, unknown>>();
    let indexCreated = false;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/_cluster/health')) {
        return new Response(JSON.stringify({ status: 'green' }), { status: 200 });
      }

      if (url.endsWith('/shopscale_products') && method === 'HEAD') {
        return new Response(null, { status: indexCreated ? 200 : 404 });
      }

      if (url.endsWith('/shopscale_products') && method === 'PUT') {
        indexCreated = true;
        return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      }

      if (url.includes('/_doc/') && method === 'PUT') {
        const id = decodeURIComponent(url.split('/_doc/')[1]!);
        const doc = JSON.parse(String(init?.body));
        store.set(id, doc);
        return new Response(JSON.stringify({ _id: id, result: 'created' }), { status: 201 });
      }

      if (url.endsWith('/_bulk') && method === 'POST') {
        const lines = String(init?.body).trim().split('\n');
        for (let i = 0; i < lines.length; i += 2) {
          const action = JSON.parse(lines[i]!);
          const doc = JSON.parse(lines[i + 1]!);
          store.set(action.index._id, doc);
        }
        return new Response(JSON.stringify({ errors: false, items: [] }), { status: 200 });
      }

      if (url.endsWith('/_search') && method === 'POST') {
        const queryDsl = JSON.parse(String(init?.body));
        const allDocs = Array.from(store.values());

        // Simple mock search evaluation
        let matched = allDocs;
        if (queryDsl.query?.bool?.must?.multi_match) {
          const q = String(queryDsl.query.bool.must.multi_match.query).toLowerCase();
          matched = allDocs.filter(d =>
            String(d['title']).toLowerCase().includes(q) ||
            String(d['brand']).toLowerCase().includes(q)
          );
        } else if (queryDsl.query?.bool?.must?.match?.['title.autocomplete']) {
          const q = String(queryDsl.query.bool.must.match['title.autocomplete'].query).toLowerCase();
          matched = allDocs.filter(d => String(d['title']).toLowerCase().startsWith(q));
        }

        const hits = matched.slice(0, queryDsl.size ?? 20).map(d => ({
          _id: String(d['productId']),
          _source: d,
        }));

        // Brand facet mock
        const brandCounts = new Map<string, number>();
        for (const doc of matched) {
          const b = String(doc['brand'] ?? 'Unknown');
          brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
        }

        const responseBody = {
          hits: {
            total: { value: matched.length },
            hits,
          },
          aggregations: {
            brands: {
              buckets: Array.from(brandCounts.entries()).map(([k, count]) => ({ key: k, doc_count: count })),
            },
            categories: { buckets: [] },
            price_ranges: { buckets: [] },
          },
        };

        return new Response(JSON.stringify(responseBody), { status: 200 });
      }

      if (url.includes('/_doc/') && method === 'DELETE') {
        const id = decodeURIComponent(url.split('/_doc/')[1]!);
        store.delete(id);
        return new Response(JSON.stringify({ _id: id, result: 'deleted' }), { status: 200 });
      }

      return new Response('Not found', { status: 404 });
    };

    const adapter = new OpenSearchSearchAdapter({
      baseUrl: 'http://mock-opensearch:9200',
      fetchFn: mockFetch,
    });

    it('creates index and validates cluster health', async () => {
      const isHealthy = await adapter.healthCheck();
      expect(isHealthy).toBe(true);

      await adapter.ensureIndex();
      expect(indexCreated).toBe(true);
    });

    it('indexes single and bulk documents with OpenSearch mapping schema', async () => {
      const sampleDoc: SearchDocumentInput = {
        productId: 'prod-001',
        storeId: 'store-001',
        title: 'Sony WH-1000XM5 Wireless Headphones',
        description: 'Industry leading noise cancellation',
        brand: 'Sony',
        categoryId: 'cat-audio',
        minPriceCents: 39999,
        currency: 'USD',
        ratingAvg: 4.8,
        ratingCount: 1250,
        salesCount: 450,
      };

      await adapter.indexDocument(sampleDoc);
      expect(store.has('prod-001')).toBe(true);

      const bulkDocs: SearchDocumentInput[] = [
        {
          productId: 'prod-002',
          storeId: 'store-001',
          title: 'Sony WF-1000XM5 Earbuds',
          description: 'True wireless noise cancelling earbuds',
          brand: 'Sony',
          categoryId: 'cat-audio',
          minPriceCents: 29999,
          currency: 'USD',
        },
        {
          productId: 'prod-003',
          storeId: 'store-002',
          title: 'Bose QuietComfort 45',
          description: 'Iconic quiet, comfort, and sound',
          brand: 'Bose',
          categoryId: 'cat-audio',
          minPriceCents: 32900,
          currency: 'USD',
        },
      ];

      await adapter.indexBulk(bulkDocs);
      expect(store.size).toBe(3);
    });

    it('executes text search and parses hits, facets, and cursor', async () => {
      const result = await adapter.search('Sony', { channel: 'marketplace' }, { limit: 10 });
      expect(result.items).toHaveLength(2);
      expect(result.totalHits).toBe(2);
      expect(result.items[0]!.title).toContain('Sony');
      expect(result.facets.brands).toContainEqual({ value: 'Sony', count: 2 });
    });

    it('executes prefix autocomplete matching edge_ngram index', async () => {
      const suggestions = await adapter.suggest('Son', { limit: 5 });
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]!.text).toContain('Sony');
      expect(suggestions[0]!.slug).toBe('prod-001');
    });

    it('deletes document by product ID', async () => {
      await adapter.deleteDocument('prod-003');
      expect(store.has('prod-003')).toBe(false);
      expect(store.size).toBe(2);
    });
  });
});
