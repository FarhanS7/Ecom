// packages/backend/src/stores/admin-stores.test.ts - Unit tests for platform admin store listing and support auth (T069).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Sql } from 'postgres';
import { listAdminStores, requireSupportOrAdmin } from './onboarding.service.js';

describe('Admin Stores & Support Auth (T069)', () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const supportId = '22222222-2222-4222-8222-222222222222';
  const customerId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('requireSupportOrAdmin', () => {
    it('succeeds for user with admin role', async () => {
      const stubSql = {
        unsafe: vi.fn().mockResolvedValue([{ key: 'admin' }]),
      } as unknown as Sql;

      const result = await requireSupportOrAdmin(stubSql, adminId);
      expect(result.isAdmin).toBe(true);
      expect(result.isSupport).toBe(false);
    });

    it('succeeds for user with support role', async () => {
      const stubSql = {
        unsafe: vi.fn().mockResolvedValue([{ key: 'support' }]),
      } as unknown as Sql;

      const result = await requireSupportOrAdmin(stubSql, supportId);
      expect(result.isAdmin).toBe(false);
      expect(result.isSupport).toBe(true);
    });

    it('rejects user with neither admin nor support role', async () => {
      const stubSql = {
        unsafe: vi.fn().mockResolvedValue([]),
      } as unknown as Sql;

      await expect(requireSupportOrAdmin(stubSql, customerId)).rejects.toThrow('Support or admin access required.');
    });
  });

  describe('listAdminStores', () => {
    it('rejects non-admin actor with 403 / FORBIDDEN', async () => {
      const stubSql = {
        unsafe: vi.fn().mockResolvedValue([]), // no admin role
      } as unknown as Sql;

      await expect(listAdminStores({ actorId: supportId }, stubSql)).rejects.toThrow('Platform admin access required.');
    });

    it('returns formatted store list for admin actor', async () => {
      const stubSql = {
        unsafe: vi.fn().mockImplementation(async (query: string) => {
          if (query.includes('platform_roles')) {
            return [{ 1: 1 }]; // admin role check
          }
          if (query.includes('FROM "stores"')) {
            return [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                business_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                slug: 'apex-athletics',
                name: 'Apex Athletics',
                status: 'pending',
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                owner_email: 'seller@apex.com',
              },
            ];
          }
          return [];
        }),
      } as unknown as Sql;

      const stores = await listAdminStores({ actorId: adminId }, stubSql);
      expect(stores).toHaveLength(1);
      expect(stores[0]?.name).toBe('Apex Athletics');
      expect(stores[0]?.ownerEmail).toBe('seller@apex.com');
      expect(stores[0]?.status).toBe('pending');
    });
  });
});
