// @shopscale/backend/search - Search projection, typo tolerance, facets
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
  async search() { return { items: [], facets: {}, nextCursor: null }; },
  async autocomplete() { return []; },
  async reindexFull() { throw new Error('Not implemented'); },
  async reindexProduct() { throw new Error('Not implemented'); },
};