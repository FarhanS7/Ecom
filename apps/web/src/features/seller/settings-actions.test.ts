// apps/web/src/features/seller/settings-actions.test.ts - Unit/Integration tests for store settings actions (T068).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveThemeAction,
  saveContentAction,
  inviteTeamMemberAction,
  updateTeamMemberAction,
} from './actions';
import * as api from './client';
import type { ThemeTokens } from '@shopscale/contracts';

describe('Store Settings Actions (T068)', () => {
  const storeId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveThemeAction', () => {
    const validTheme: ThemeTokens = {
      primary: '#0070f3',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      muted: '#6b7280',
      accent: '#ec4899',
      radius: 8,
    };

    it('rejects invalid store IDs', async () => {
      const res = await saveThemeAction('invalid-store-id', validTheme);
      expect(res.status).toBe('not-found');
    });

    it('rejects malformed theme tokens with invalid hex colors', async () => {
      const invalidTheme = { ...validTheme, primary: 'invalid-hex' };
      const res = await saveThemeAction(storeId, invalidTheme);
      expect(res.status).toBe('bad-input');
      if (res.status === 'bad-input') {
        expect(res.message).toContain('Invalid theme colors');
      }
    });

    it('rejects radius outside 0-16 bounds', async () => {
      const invalidRadius = { ...validTheme, radius: 24 };
      const res = await saveThemeAction(storeId, invalidRadius);
      expect(res.status).toBe('bad-input');
    });

    it('calls client API and returns saved theme on success', async () => {
      const spy = vi.spyOn(api, 'saveStoreTheme').mockResolvedValue({
        status: 'ok',
        data: { theme: validTheme },
      });

      const res = await saveThemeAction(storeId, validTheme);
      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.data).toEqual(validTheme);
      }
      expect(spy).toHaveBeenCalledWith(storeId, validTheme);
    });
  });

  describe('saveContentAction', () => {
    it('validates and updates store headline content', async () => {
      const content = { headline: 'Engineered For Speed' };
      const spy = vi.spyOn(api, 'saveStoreContent').mockResolvedValue({
        status: 'ok',
        data: {
          storeId,
          version: 2,
          headline: 'Engineered For Speed',
          featuredIds: [],
          socials: {},
          swatches: {},
        },
      });

      const res = await saveContentAction(storeId, content);
      expect(res.status).toBe('ok');
      expect(spy).toHaveBeenCalledWith(storeId, content);
    });
  });

  describe('inviteTeamMemberAction', () => {
    it('rejects invalid email formats', async () => {
      const res = await inviteTeamMemberAction(storeId, {
        email: 'not-an-email',
        role: 'catalog-editor',
      });
      expect(res.status).toBe('bad-input');
    });

    it('rejects invalid role strings', async () => {
      const res = await inviteTeamMemberAction(storeId, {
        email: 'valid@example.com',
        role: 'superuser',
      });
      expect(res.status).toBe('bad-input');
    });

    it('successfully dispatches invitation via client API', async () => {
      const spy = vi.spyOn(api, 'inviteTeamMember').mockResolvedValue({
        status: 'ok',
        data: {
          invitationId: '00000000-0000-0000-0000-000000000002',
          storeId,
          email: 'staff@example.com',
          role: 'fulfillment',
          expiresAt: new Date().toISOString(),
          token: 'mock-token',
        },
      });

      const res = await inviteTeamMemberAction(storeId, {
        email: 'staff@example.com',
        role: 'fulfillment',
      });
      expect(res.status).toBe('ok');
      expect(spy).toHaveBeenCalledWith(storeId, {
        email: 'staff@example.com',
        role: 'fulfillment',
      });
    });
  });

  describe('updateTeamMemberAction', () => {
    it('updates member role and status', async () => {
      const targetUserId = '00000000-0000-0000-0000-000000000003';
      const spy = vi.spyOn(api, 'updateTeamMember').mockResolvedValue({
        status: 'ok',
        data: {
          storeId,
          userId: targetUserId,
          role: 'manager',
          status: 'active',
        },
      });

      const res = await updateTeamMemberAction(storeId, targetUserId, {
        role: 'manager',
      });
      expect(res.status).toBe('ok');
      expect(spy).toHaveBeenCalledWith(storeId, targetUserId, { role: 'manager' });
    });
  });
});
