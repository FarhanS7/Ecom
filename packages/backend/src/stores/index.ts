// @shopscale/backend/stores - Store memberships, staff, channel resolution
export * from './schema.js';
export * from './permissions.js';
export * from './onboarding.service.js';
export * from './theme.service.js';
export * from './channel.service.js';
import type { StoreMembership } from './permissions.js';

export interface Store {
  id: string;
  businessId: string;
  slug: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
}

export interface StorePorts {
  findStoreBySlug(slug: string): Promise<Store | null>;
  findStoreById(id: string): Promise<Store | null>;
  findMembership(storeId: string, userId: string): Promise<StoreMembership | null>;
  createStore(data: { businessId: string; slug: string; name: string }): Promise<Store>;
  createMembership(data: { storeId: string; userId: string; role: string }): Promise<StoreMembership>;
  updateMembership(storeId: string, userId: string, data: Partial<StoreMembership>): Promise<StoreMembership>;
}

export const storePorts: StorePorts = {
  findStoreBySlug() { return Promise.resolve(null); },
  findStoreById() { return Promise.resolve(null); },
  findMembership() { return Promise.resolve(null); },
  createStore() { return Promise.reject(new Error('Not implemented')); },
  createMembership() { return Promise.reject(new Error('Not implemented')); },
  updateMembership() { return Promise.reject(new Error('Not implemented')); },
};

export type Channel = 'marketplace' | 'store';

export interface ResolvedChannel {
  channel: Channel;
  storeId: string | undefined;
}

export function resolveChannel(hostname: string, path: string): ResolvedChannel {
  // Marketplace at root path
  if (path === '/' || path.startsWith('/search') || path.startsWith('/products')) {
    return { channel: 'marketplace', storeId: undefined };
  }
  // Store at /stores/{slug}
  const match = path.match(/^\/stores\/([^/]+)/);
  if (match) {
    return { channel: 'store', storeId: match[1] };
  }
  return { channel: 'marketplace', storeId: undefined };
}
