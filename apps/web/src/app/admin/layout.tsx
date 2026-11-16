// @shopscale/web app/admin/layout.tsx - Platform administrator layout and navigation (T067, T069).

import Link from 'next/link';
import { Frame } from '@/components/ui';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ss-admin-layout" style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg, #f9fafb)' }}>
      <header
        style={{
          backgroundColor: 'var(--color-surface, #ffffff)',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          padding: 'var(--space-4) 0',
        }}
      >
        <Frame>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: 'var(--color-primary, #0070f3)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Platform Admin
              </span>
              <span className="type-h3" style={{ margin: 0 }}>
                Operations Console
              </span>
            </div>

            <nav
              aria-label="Admin Navigation"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <Link
                href="/admin/dashboard"
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #111827)',
                  textDecoration: 'none',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius, 4px)',
                }}
              >
                Dashboard
              </Link>
              <Link
                href="/admin/sellers"
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #111827)',
                  textDecoration: 'none',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius, 4px)',
                }}
              >
                Merchants
              </Link>
              <Link
                href="/admin/categories"
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #111827)',
                  textDecoration: 'none',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius, 4px)',
                }}
              >
                Categories
              </Link>
            </nav>
          </div>
        </Frame>
      </header>

      <main>{children}</main>
    </div>
  );
}
