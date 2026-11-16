// @shopscale/backend/search - Search projection, typo tolerance, facets
export * from './projector.js';
export * from './query-parser.js';
export * from './query.service.js';
export * from './autocomplete.service.js';
export * from './reindex.service.js';
export * from './search.port.js';
export * from './opensearch-query-builder.js';
export * from './opensearch.adapter.js';
export * from './postgres.adapter.js';
export interface SearchDocument {
  id: string;
  productId: string;
  storeId: string;
  channel: 'marketplace' | 'store';
  title: string;
  brand: string | null;
  priceCents: number;
  currency: string;
  attributes: Record<string, unknown>;
  primaryImageUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  salesCount: number;
  searchVector: string; // tsvector for FTS
  publicationVersion: number;
  updatedAt: Date;
}

export interface SearchPorts {
  search(query: string, filters: Record<string, unknown>, options: { cursor?: string; limit: number; facets?: string[] }): Promise<{ items: SearchDocument[]; facets: Record<string, Array<{ value: string; count: number }>>; nextCursor: string | null }>;
  autocomplete(query: string, limit: number): Promise<string[]>;
  reindexFull(): Promise<void>;
  reindexProduct(productId: string): Promise<void>;
}

export const searchPorts: SearchPorts = {
  search() { return Promise.resolve({ items: [], facets: {}, nextCursor: null }); },
  autocomplete() { return Promise.resolve([]); },
  reindexFull() { return Promise.reject(new Error('Not implemented')); },
  reindexProduct() { return Promise.reject(new Error('Not implemented')); },
};