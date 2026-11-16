// apps/api/src/stores.controller.test.ts - Unit tests for StoresController (T068).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoresController } from './stores.controller.js';
import * as backend from '@shopscale/backend';
import type { ThemeTokens } from '@shopscale/contracts';

describe('StoresController (T068)', () => {
  let controller: StoresController;
  const storeId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';
  const mockActor: backend.Actor = {
    userId,
    status: 'active',
    roles: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    controller = new StoresController();
  });

  describe('membership', () => {
    it('throws 404 if unauthenticated or store ID is invalid', async () => {
      await expect(controller.membership({}, 'invalid-id')).rejects.toThrow('Store not found.');
      await expect(controller.membership({}, storeId)).rejects.toThrow('Store not found.');
    });

    it('returns membership details for active member', async () => {
      vi.spyOn(backend, 'getMembership').mockResolvedValue({
        storeId,
        userId,
        role: 'owner',
        status: 'active',
      });

      const result = await controller.membership({ actor: mockActor }, storeId);
      expect(result).toEqual({
        storeId,
        role: 'owner',
        status: 'active',
      });
    });
  });

  describe('getTeam', () => {
    it('returns team members and pending invitations', async () => {
      vi.spyOn(backend, 'listStoreTeam').mockResolvedValue({
        storeId,
        members: [
          {
            userId,
            email: 'owner@store.com',
            role: 'owner',
            status: 'active',
          },
        ],
        invitations: [
          {
            id: '00000000-0000-0000-0000-000000000010',
            email: 'invited@store.com',
            role: 'fulfillment',
            expiresAt: '2026-12-01T00:00:00.000Z',
            createdAt: '2026-11-16T00:00:00.000Z',
          },
        ],
      });

      const result = (await controller.getTeam({ actor: mockActor }, storeId)) as {
        storeId: string;
        members: unknown[];
        invitations: unknown[];
      };
      expect(result.storeId).toBe(storeId);
      expect(result.members).toHaveLength(1);
      expect(result.invitations).toHaveLength(1);
    });
  });

  describe('theme endpoints', () => {
    const customTheme: ThemeTokens = {
      primary: '#0070f3',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      muted: '#6b7280',
      accent: '#ec4899',
      radius: 8,
    };

    it('getTheme checks store read permission and returns tokens', async () => {
      vi.spyOn(backend, 'authorizeStore').mockResolvedValue(true);
      vi.spyOn(backend, 'getTheme').mockResolvedValue(customTheme);

      const res = (await controller.getTheme({ actor: mockActor }, storeId)) as { theme: ThemeTokens };
      expect(res.theme).toEqual(customTheme);
    });

    it('saveTheme updates store theme tokens', async () => {
      vi.spyOn(backend, 'saveTheme').mockResolvedValue(customTheme);

      const res = (await controller.saveTheme(
        { actor: mockActor, requestId: 'req-theme-1' },
        storeId,
        { theme: customTheme },
      )) as { theme: ThemeTokens };

      expect(res.theme).toEqual(customTheme);
      expect(backend.saveTheme).toHaveBeenCalledWith({
        storeId,
        actorId: userId,
        tokens: customTheme,
        requestId: 'req-theme-1',
      });
    });
  });

  describe('content endpoints', () => {
    it('getContent and saveContent manage homepage headline', async () => {
      vi.spyOn(backend, 'authorizeStore').mockResolvedValue(true);
      vi.spyOn(backend, 'getStoreContent').mockResolvedValue({
        storeId,
        version: 1,
        headline: 'Welcome to Apex',
        featuredIds: [],
        socials: {},
        swatches: {},
      });

      const getRes = (await controller.getContent({ actor: mockActor }, storeId)) as {
        headline: string;
      };
      expect(getRes.headline).toBe('Welcome to Apex');

      vi.spyOn(backend, 'saveStoreContent').mockResolvedValue({
        storeId,
        version: 2,
        headline: 'Engineered For Performance',
        featuredIds: [],
        socials: {},
        swatches: {},
      });

      const putRes = (await controller.saveContent(
        { actor: mockActor, requestId: 'req-content-1' },
        storeId,
        { headline: 'Engineered For Performance' },
      )) as { headline: string; version: number };

      expect(putRes.headline).toBe('Engineered For Performance');
      expect(putRes.version).toBe(2);
    });
  });
});
