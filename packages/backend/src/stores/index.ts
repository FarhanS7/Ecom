// @shopscale/backend/stores - Store memberships, staff, channel resolution
export interface Store {
  id: string;
  businessId: string;
  slug: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  theme: Record<string, unknown>;
  commissionRate: number;
  createdAt: Date;
  approvedAt: Date | null;
}

export interface StoreMembership {
  id: string;
  storeId: string;
  userId: string;
  role: 'owner' | 'manager' | 'catalog_editor' | 'fulfillment_staff';
  status: 'active' | 'invited' | 'revoked';
  invitedAt: Date;
  acceptedAt: Date | null;
}

export interface StorePorts {
  findStoreBySlug(slug: string): Promise<Store | null>;
  findStoreById(id: string): Promise<Store | null>;
  findMembership(storeId: string, userId: string): Promise<StoreMembership | null>;
  createStore(data: { businessId: string; slug: string; name: string }): Promise<Store>;
  createMembership(data: { storeId: string; userId: string; role: StoreMembership['role'] }): Promise<StoreMembership>;
  updateMembership(id: string, data: Partial<StoreMembership>): Promise<StoreMembership>;
}

export const storePorts: StorePorts = {
  async findStoreBySlug() { return null; },
  async findStoreById() { return null; },
  async findMembership() { return null; },
  async createStore() { throw new Error('Not implemented'); },
  async createMembership() { throw new Error('Not implemented'); },
  async updateMembership() { throw new Error('Not implemented'); },
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