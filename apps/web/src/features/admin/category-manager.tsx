'use client';

// @shopscale/web features/admin/category-manager.tsx - Category hierarchy manager (T069).
import { useState } from 'react';
import type { CategoryDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';
import {
  createCategoryAction,
  deleteCategoryAction,
  reparentCategoryAction,
} from './actions';

export interface CategoryManagerProps {
  initialCategories: CategoryDto[];
}

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const [categories, setCategories] = useState<CategoryDto[]>(initialCategories);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reparentTargetId, setReparentTargetId] = useState<string | null>(null);
  const [selectedNewParentId, setSelectedNewParentId] = useState<string>('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);

    const trimmedName = newName.trim();
    const trimmedSlug = newSlug.trim().toLowerCase();

    if (!trimmedName) {
      setBanner({ type: 'error', message: 'Category name is required.' });
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      setBanner({
        type: 'error',
        message: 'Category slug must be lowercase alphanumeric with hyphens (e.g. "running-shoes").',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createCategoryAction({
        name: trimmedName,
        slug: trimmedSlug,
        parentId: newParentId || null,
      });

      if (res.success) {
        setBanner({ type: 'success', message: `Category "${trimmedName}" created successfully.` });
        setNewName('');
        setNewSlug('');
        setNewParentId('');
        // Optimistic refresh
        const parentCategory = categories.find((c) => c.id === newParentId);
        const parentPath = parentCategory ? parentCategory.path : null;
        const generatedPath = parentPath ? `${parentPath}${trimmedSlug}/` : `/${trimmedSlug}/`;
        setCategories((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            parentId: newParentId || null,
            slug: trimmedSlug,
            name: trimmedName,
            path: generatedPath,
          },
        ]);
      } else {
        setBanner({ type: 'error', message: res.message || 'Failed to create category.' });
      }
    } catch {
      setBanner({ type: 'error', message: 'Network error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReparentSubmit(categoryId: string) {
    setBanner(null);
    try {
      const res = await reparentCategoryAction({
        categoryId,
        parentId: selectedNewParentId || null,
      });

      if (res.success) {
        setBanner({ type: 'success', message: 'Category reparented successfully.' });
        setReparentTargetId(null);
      } else {
        setBanner({ type: 'error', message: res.message || 'Failed to reparent category.' });
      }
    } catch {
      setBanner({ type: 'error', message: 'Network error occurred.' });
    }
  }

  async function handleDelete(categoryId: string, categoryName: string) {
    if (!window.confirm(`Delete category "${categoryName}"? Children or attached products will prevent deletion.`)) {
      return;
    }

    setBanner(null);
    try {
      const res = await deleteCategoryAction(categoryId);
      if (res.success) {
        setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        setBanner({ type: 'success', message: `Category "${categoryName}" deleted successfully.` });
      } else {
        setBanner({ type: 'error', message: res.message || 'Failed to delete category.' });
      }
    } catch {
      setBanner({ type: 'error', message: 'Network error occurred.' });
    }
  }

  return (
    <div className="ss-category-manager" data-testid="category-manager">
      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          data-testid="category-banner"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius, 6px)',
            marginBottom: 'var(--space-4)',
            backgroundColor: banner.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: banner.type === 'error' ? '#991b1b' : '#166534',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{banner.message}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-6)',
          alignItems: 'start',
        }}
      >
        {/* Create Category Form */}
        <Card style={{ padding: 'var(--space-6)' }}>
          <h2 className="type-h3" style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>
            Add New Category
          </h2>
          <form onSubmit={(e) => { void handleCreate(e); }}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label
                htmlFor="category-name-input"
                className="type-body-strong"
                style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.875rem' }}
              >
                Category Name
              </label>
              <input
                id="category-name-input"
                type="text"
                placeholder="e.g. Trail Running"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug) {
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                  }
                }}
                disabled={isSubmitting}
                data-testid="category-name-input"
                style={{
                  width: '100%',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius, 4px)',
                  border: '1px solid var(--border-color, #d1d5db)',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label
                htmlFor="category-slug-input"
                className="type-body-strong"
                style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.875rem' }}
              >
                URL Slug
              </label>
              <input
                id="category-slug-input"
                type="text"
                placeholder="e.g. trail-running"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                disabled={isSubmitting}
                data-testid="category-slug-input"
                style={{
                  width: '100%',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius, 4px)',
                  border: '1px solid var(--border-color, #d1d5db)',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-6)' }}>
              <label
                htmlFor="category-parent-select"
                className="type-body-strong"
                style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.875rem' }}
              >
                Parent Category (Optional)
              </label>
              <select
                id="category-parent-select"
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                disabled={isSubmitting}
                data-testid="category-parent-select"
                style={{
                  width: '100%',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius, 4px)',
                  border: '1px solid var(--border-color, #d1d5db)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">None (Top-level Root Category)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path} ({c.name})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="create-category-btn"
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius, 4px)',
                border: 'none',
                backgroundColor: 'var(--color-primary, #0070f3)',
                color: '#ffffff',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Creating Category...' : 'Create Category'}
            </button>
          </form>
        </Card>

        {/* Categories Hierarchy Table */}
        <Card style={{ overflow: 'hidden' }}>
          <div
            style={{
              padding: 'var(--space-4)',
              borderBottom: '1px solid var(--border-color, #e5e7eb)',
              backgroundColor: 'var(--color-bg, #f9fafb)',
            }}
          >
            <h2 className="type-h3" style={{ margin: 0 }}>
              Category Hierarchy ({categories.length})
            </h2>
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.875rem',
            }}
            data-testid="categories-table"
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Name</th>
                <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Path</th>
                <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                    No categories created yet.
                  </td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr
                    key={cat.id}
                    style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}
                    data-testid={`category-row-${cat.id}`}
                  >
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>{cat.name}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <code style={{ fontSize: '0.85em', color: 'var(--text-secondary, #6b7280)' }}>{cat.path}</code>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setReparentTargetId(cat.id);
                            setSelectedNewParentId(cat.parentId || '');
                          }}
                          data-testid={`reparent-btn-${cat.id}`}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color, #d1d5db)',
                            background: 'transparent',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDelete(cat.id, cat.name);
                          }}
                          data-testid={`delete-cat-btn-${cat.id}`}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid #dc2626',
                            background: 'transparent',
                            color: '#dc2626',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>

                      {/* Reparent selector inline */}
                      {reparentTargetId === cat.id && (
                        <div
                          style={{
                            marginTop: 'var(--space-2)',
                            padding: 'var(--space-2)',
                            backgroundColor: 'var(--color-bg, #f9fafb)',
                            borderRadius: '4px',
                            display: 'flex',
                            gap: 'var(--space-2)',
                            alignItems: 'center',
                          }}
                        >
                          <select
                            value={selectedNewParentId}
                            onChange={(e) => setSelectedNewParentId(e.target.value)}
                            style={{ fontSize: '0.75rem', padding: '2px 4px' }}
                            data-testid={`reparent-select-${cat.id}`}
                          >
                            <option value="">Move to Root</option>
                            {categories
                              .filter((c) => c.id !== cat.id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.path})
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              void handleReparentSubmit(cat.id);
                            }}
                            data-testid={`save-reparent-btn-${cat.id}`}
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              border: 'none',
                              backgroundColor: 'var(--color-primary, #0070f3)',
                              color: '#fff',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setReparentTargetId(null)}
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              border: 'none',
                              background: 'transparent',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
