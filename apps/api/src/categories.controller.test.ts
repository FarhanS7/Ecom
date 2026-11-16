// @shopscale/api/categories.controller.test - Unit tests for CategoriesController (T069).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesController } from './categories.controller.js';
import {
  CategoryError,
  createCategory,
  deleteCategory,
  listCategories,
  recordAudit,
  reparentCategory,
  requirePlatformAdmin,
} from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listCategories: vi.fn(),
  reparentCategory: vi.fn(),
  recordAudit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  CategoryError: class extends Error {
    constructor(public readonly failure: string, message: string) {
      super(message);
    }
  },
  OnboardingError: class extends Error {
    constructor(public readonly failure: string, message: string) {
      super(message);
    }
  },
}));

describe('CategoriesController (T069 Unit Tests)', () => {
  let controller: CategoriesController;
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  const categoryId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new CategoriesController();
  });

  it('lists categories without requiring authentication (public)', async () => {
    vi.mocked(listCategories).mockResolvedValueOnce([
      {
        id: categoryId,
        parentId: null,
        slug: 'footwear',
        name: 'Footwear',
        path: '/footwear/',
      },
    ]);

    const result = (await controller.listCategories()) as { items: unknown[] };
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ slug: 'footwear', name: 'Footwear' });
  });

  it('creates category when actor is platform admin', async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValueOnce(undefined);
    vi.mocked(createCategory).mockResolvedValueOnce({
      id: categoryId,
      parentId: null,
      slug: 'running-shoes',
      name: 'Running Shoes',
      path: '/running-shoes/',
    });

    const result = await controller.createCategory(
      { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] }, requestId: 'req_cat_1' },
      { name: 'Running Shoes', slug: 'running-shoes' },
    );

    expect(result).toMatchObject({ id: categoryId, slug: 'running-shoes', name: 'Running Shoes' });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'category.created',
        actorId: adminUserId,
      }),
    );
  });

  it('rejects createCategory with 400 on malformed slug', async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValueOnce(undefined);

    await expect(
      controller.createCategory(
        { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
        { name: 'Bad Slug', slug: 'UPPER_CASE_INVALID!' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reparents category and detects cycle, returning 409 Conflict', async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValueOnce(undefined);
    vi.mocked(reparentCategory).mockRejectedValueOnce(
      new CategoryError('CATEGORY_CYCLE', 'Re-parenting would create a cycle.'),
    );

    await expect(
      controller.reparentCategory(
        { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
        categoryId,
        { parentId: '33333333-3333-4333-8333-333333333333' },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('deletes category for admin and records audit', async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValueOnce(undefined);
    vi.mocked(deleteCategory).mockResolvedValueOnce(undefined);

    const result = await controller.deleteCategory(
      { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
      categoryId,
    );

    expect(result).toEqual({ success: true });
    expect(deleteCategory).toHaveBeenCalledWith(categoryId);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'category.deleted',
      }),
    );
  });
});
