// @shopscale/web app/admin/categories/page.tsx - Category tree hierarchy manager (T069).

import { redirect } from 'next/navigation';
import { Card, Frame } from '@/components/ui';
import { currentSessionEmail } from '@/lib/session-server';
import { loadAdminCategories } from '@/features/admin/load';
import { CategoryManager } from '@/features/admin/category-manager';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Category Hierarchy Manager | Platform Admin',
};

export default async function AdminCategoriesPage() {
  const email = await currentSessionEmail();
  if (!email) {
    redirect('/login?next=/admin/categories');
  }

  const categories = await loadAdminCategories();
  if (!categories) {
    return (
      <section style={{ padding: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto' }}>
        <Card style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <h1 className="type-h3" style={{ marginBottom: 'var(--space-2)' }}>
            Access Restricted
          </h1>
          <p className="type-body" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            You do not have administrative privileges to manage catalog categories.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section style={{ padding: 'var(--space-6) 0' }}>
      <Frame>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 className="type-h2" style={{ margin: '0 0 var(--space-1) 0' }}>
            Catalog Category Hierarchy
          </h1>
          <p className="type-caption" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            Manage category tree, materialize navigation paths, and organize taxonomy across marketplace and stores.
          </p>
        </div>

        <CategoryManager initialCategories={categories} />
      </Frame>
    </section>
  );
}
