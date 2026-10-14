// @shopscale/backend/catalog - Products, variants, publication, media
export interface Product {
  id: string;
  sellerId: string;
  categoryId: string;
  title: string;
  slug: string;
  brand: string | null;
  description: string;
  priceCents: number;
  currency: string;
  status: 'draft' | 'active' | 'archived';
  attributes: Record<string, unknown>;
  ratingAvg: number | null;
  ratingCount: number;
  salesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  priceCents: number | null;
  attributes: Record<string, unknown>;
  onHand: number;
  reserved: number;
  version: number;
}

export interface Publication {
  productId: string;
  channel: 'marketplace' | 'store';
  status: 'published' | 'unpublished';
  publishedAt: Date | null;
}

export interface CatalogPorts {
  findProductBySlug(slug: string, channel: 'marketplace' | 'store'): Promise<Product | null>;
  findProductById(id: string): Promise<Product | null>;
  findProductsByCategory(categoryId: string, options: { cursor?: string; limit: number; sort?: string }): Promise<{ items: Product[]; nextCursor: string | null }>;
  searchProducts(query: string, filters: Record<string, unknown>, options: { cursor?: string; limit: number }): Promise<{ items: Product[]; nextCursor: string | null }>;
  createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'ratingAvg' | 'ratingCount' | 'salesCount'>): Promise<Product>;
  updateProduct(id: string, data: Partial<Product>): Promise<Product>;
  publishProduct(productId: string, channel: 'marketplace' | 'store'): Promise<void>;
  unpublishProduct(productId: string, channel: 'marketplace' | 'store'): Promise<void>;
}

export const catalogPorts: CatalogPorts = {
  findProductBySlug() { return Promise.resolve(null); },
  findProductById() { return Promise.resolve(null); },
  findProductsByCategory() { return Promise.resolve({ items: [], nextCursor: null }); },
  searchProducts() { return Promise.resolve({ items: [], nextCursor: null }); },
  createProduct() { return Promise.reject(new Error('Not implemented')); },
  updateProduct() { return Promise.reject(new Error('Not implemented')); },
  publishProduct() { return Promise.reject(new Error('Not implemented')); },
  unpublishProduct() { return Promise.reject(new Error('Not implemented')); },
};