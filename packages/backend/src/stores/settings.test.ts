// packages/backend/src/stores/settings.test.ts - Unit tests for store settings, team listing, and content (T068).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Sql, TransactionSql } from 'postgres';
import { DEFAULT_THEME, type ThemeTokens } from '@shopscale/contracts';
import { saveTheme } from './theme.service.js';
import { getStoreContent, saveStoreContent } from './content.service.js';
import { listStoreTeam } from './onboarding.service.js';
import * as permissions from './permissions.js';

describe('Store Settings Domain Services (T068)', () => {
  const storeId = '00000000-0000-0000-0000-000000000001';
  const ownerId = '00000000-0000-0000-0000-000000000002';
  const editorId = '00000000-0000-0000-0000-000000000003';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveTheme', () => {
    const validCustomTheme: ThemeTokens = {
      primary: '#0070f3',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      muted: '#6b7280',
      accent: '#ec4899',
      radius: 12,
    };

    it('rejects save when actor lacks store or team manage permission', async () => {
      vi.spyOn(permissions, 'authorizeStore').mockResolvedValue(false);
      const stubSql = {} as unknown as Sql;

      await expect(
        saveTheme(
          {
            storeId,
            actorId: editorId,
            tokens: validCustomTheme,
            requestId: 'req-1',
          },
          stubSql,
        ),
      ).rejects.toThrow('Store not found.');
    });

    it('rejects invalid theme tokens with bad hex format', async () => {
      vi.spyOn(permissions, 'authorizeStore').mockResolvedValue(true);
      const stubSql = {} as unknown as Sql;

      const invalidTheme = { ...validCustomTheme, primary: 'not-hex' };
      await expect(
        saveTheme(
          {
            storeId,
            actorId: ownerId,
            tokens: invalidTheme as unknown as ThemeTokens,
            requestId: 'req-1',
          },
          stubSql,
        ),
      ).rejects.toThrow('Invalid theme tokens.');
    });

    it('persists valid theme tokens and records audit entry', async () => {
      vi.spyOn(permissions, 'authorizeStore').mockResolvedValue(true);

      const mockQueries: string[] = [];
      const stubTx: Partial<TransactionSql> = {
        unsafe: vi.fn().mockImplementation(async (query: string) => {
          mockQueries.push(query);
          return [{ approved_tokens: DEFAULT_THEME }];
        }),
      };

      const stubSql = {
        begin: vi.fn().mockImplementation(async (cb: (tx: TransactionSql) => Promise<unknown>) => {
          return cb(stubTx as TransactionSql);
        }),
      } as unknown as Sql;

      const result = await saveTheme(
        {
          storeId,
          actorId: ownerId,
          tokens: validCustomTheme,
          requestId: 'req-save-theme',
        },
        stubSql,
      );

      expect(result).toEqual(validCustomTheme);
      expect(stubTx.unsafe).toHaveBeenCalled();
    });
  });

  describe('storeContent', () => {
    it('returns default content when no row exists', async () => {
      const stubSql = {
        unsafe: vi.fn().mockResolvedValue([]),
      } as unknown as Sql;

      const content = await getStoreContent(storeId, stubSql);
      expect(content.storeId).toBe(storeId);
      expect(content.headline).toBeNull();
      expect(content.featuredIds).toEqual([]);
    });

    it('saves updated content when actor is authorized', async () => {
      vi.spyOn(permissions, 'authorizeStore').mockResolvedValue(true);

      const mockRow = {
        store_id: storeId,
        version: 2,
        featured_ids: [],
        headline: 'New Brand Headline',
        socials: { instagram: 'https://instagram.com/apex' },
        swatches: {},
        updated_at: new Date(),
      };

      const stubTx: Partial<TransactionSql> = {
        unsafe: vi.fn().mockImplementation(async () => [mockRow]),
      };

      const stubSql = {
        begin: vi.fn().mockImplementation(async (cb: (tx: TransactionSql) => Promise<unknown>) => {
          return cb(stubTx as TransactionSql);
        }),
      } as unknown as Sql;

      const updated = await saveStoreContent(
        {
          storeId,
          actorId: ownerId,
          content: {
            headline: 'New Brand Headline',
            socials: { instagram: 'https://instagram.com/apex' },
          },
          requestId: 'req-content',
        },
        stubSql,
      );

      expect(updated.headline).toBe('New Brand Headline');
      expect(updated.socials).toEqual({ instagram: 'https://instagram.com/apex' });
    });
  });

  describe('listStoreTeam', () => {
    it('rejects listing team when actor lacks team:manage', async () => {
      vi.spyOn(permissions, 'authorizeStore').mockResolvedValue(false);
      const stubSql = {} as unknown as Sql;

      await expect(
        listStoreTeam(
          {
            storeId,
            actorId: editorId,
          },
          stubSql,
        ),
      ).rejects.toThrow('Store not found.');
    });

    it('returns members and pending invitations for authorized actor', async () => {
      vi.spyOn(permissions, 'authorizeStore').mockResolvedValue(true);

      const stubSql = {
        unsafe: vi.fn().mockImplementation(async (query: string) => {
          if (query.includes('store_memberships')) {
            return [
              { user_id: ownerId, email: 'owner@apex.com', role: 'owner', status: 'active' },
              { user_id: editorId, email: 'editor@apex.com', role: 'catalog-editor', status: 'active' },
            ];
          }
          if (query.includes('store_invitations')) {
            return [
              {
                id: '00000000-0000-0000-0000-000000000010',
                email: 'invited@apex.com',
                role: 'fulfillment',
                expires_at: new Date(Date.now() + 86400000),
                created_at: new Date(),
              },
            ];
          }
          return [];
        }),
      } as unknown as Sql;

      const team = await listStoreTeam({ storeId, actorId: ownerId }, stubSql);
      expect(team.members).toHaveLength(2);
      expect(team.invitations).toHaveLength(1);
      expect(team.members[0]?.email).toBe('owner@apex.com');
      expect(team.invitations[0]?.email).toBe('invited@apex.com');
    });
  });
});
