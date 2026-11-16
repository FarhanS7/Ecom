// @shopscale/web features/admin/category-manager.test - Unit tests for CategoryManager (T069).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CategoryDto } from '@shopscale/contracts';
import { CategoryManager } from './category-manager';
import * as actions from './actions';

vi.mock('./actions', () => ({
  createCategoryAction: vi.fn(),
  reparentCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
}));

describe('CategoryManager (T069)', () => {
  const mockCategories: CategoryDto[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      parentId: null,
      slug: 'footwear',
      name: 'Footwear',
      path: '/footwear/',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      parentId: '11111111-1111-4111-8111-111111111111',
      slug: 'running-shoes',
      name: 'Running Shoes',
      path: '/footwear/running-shoes/',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders category list with paths and names', () => {
    render(<CategoryManager initialCategories={mockCategories} />);

    expect(screen.getByText('Footwear')).toBeDefined();
    expect(screen.getByText('/footwear/')).toBeDefined();
    expect(screen.getByText('Running Shoes')).toBeDefined();
    expect(screen.getByText('/footwear/running-shoes/')).toBeDefined();
  });

  it('creates new category and calls createCategoryAction', async () => {
    vi.mocked(actions.createCategoryAction).mockResolvedValueOnce({
      success: true,
      message: 'Category created successfully.',
    });

    render(<CategoryManager initialCategories={mockCategories} />);

    const nameInput = screen.getByTestId('category-name-input');
    const slugInput = screen.getByTestId('category-slug-input');
    const submitBtn = screen.getByTestId('create-category-btn');

    fireEvent.change(nameInput, { target: { value: 'Apparel' } });
    fireEvent.change(slugInput, { target: { value: 'apparel' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(actions.createCategoryAction).toHaveBeenCalledWith({
        name: 'Apparel',
        slug: 'apparel',
        parentId: null,
      });
      expect(screen.getByTestId('category-banner')).toBeDefined();
      expect(screen.getByText(/created successfully/)).toBeDefined();
    });
  });

  it('deletes category and calls deleteCategoryAction', async () => {
    vi.mocked(actions.deleteCategoryAction).mockResolvedValueOnce({
      success: true,
      message: 'Category deleted successfully.',
    });

    render(<CategoryManager initialCategories={mockCategories} />);

    const deleteBtn = screen.getByTestId('delete-cat-btn-22222222-2222-4222-8222-222222222222');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(actions.deleteCategoryAction).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
      expect(screen.getByTestId('category-banner')).toBeDefined();
      expect(screen.getByText(/deleted successfully/)).toBeDefined();
    });
  });
});
