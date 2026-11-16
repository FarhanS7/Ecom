'use client';

// @shopscale/web features/admin/merchant-moderation.tsx - Merchant moderation console (T069).
import { useState } from 'react';
import type { AdminSellerSummaryDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';
import { approveStoreAction, suspendStoreAction } from './actions';

export interface MerchantModerationProps {
  initialStores: AdminSellerSummaryDto[];
}

export function MerchantModeration({ initialStores }: MerchantModerationProps) {
  const [stores, setStores] = useState<AdminSellerSummaryDto[]>(initialStores);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'suspended'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const filteredStores = stores.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const pendingCount = stores.filter((s) => s.status === 'pending').length;
  const activeCount = stores.filter((s) => s.status === 'active').length;
  const suspendedCount = stores.filter((s) => s.status === 'suspended').length;

  async function handleApprove(storeId: string, storeName: string) {
    if (!window.confirm(`Approve storefront application for "${storeName}"? This will make the merchant active.`)) {
      return;
    }

    setProcessingId(storeId);
    setBanner(null);
    try {
      const res = await approveStoreAction(storeId);
      if (res.success) {
        setStores((prev) =>
          prev.map((s) => (s.id === storeId ? { ...s, status: 'active' } : s)),
        );
        setBanner({ type: 'success', message: `Store "${storeName}" has been successfully approved.` });
      } else {
        setBanner({ type: 'error', message: res.message || 'Failed to approve store.' });
      }
    } catch {
      setBanner({ type: 'error', message: 'An unexpected error occurred while communicating with the server.' });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleSuspend(storeId: string, storeName: string) {
    if (!window.confirm(`Suspend merchant "${storeName}"? Their storefront and products will be hidden.`)) {
      return;
    }

    setProcessingId(storeId);
    setBanner(null);
    try {
      const res = await suspendStoreAction(storeId);
      if (res.success) {
        setStores((prev) =>
          prev.map((s) => (s.id === storeId ? { ...s, status: 'suspended' } : s)),
        );
        setBanner({ type: 'success', message: `Store "${storeName}" has been suspended.` });
      } else {
        setBanner({ type: 'error', message: res.message || 'Failed to suspend store.' });
      }
    } catch {
      setBanner({ type: 'error', message: 'An unexpected error occurred while communicating with the server.' });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="ss-merchant-moderation" data-testid="merchant-moderation">
      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          data-testid="admin-banner"
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

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Card style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
          <div className="type-caption" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            Pending Applications
          </div>
          <div className="type-h2" style={{ color: '#d97706', marginTop: 'var(--space-1)' }} data-testid="metric-pending">
            {pendingCount}
          </div>
        </Card>
        <Card style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
          <div className="type-caption" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            Active Merchants
          </div>
          <div className="type-h2" style={{ color: '#16a34a', marginTop: 'var(--space-1)' }} data-testid="metric-active">
            {activeCount}
          </div>
        </Card>
        <Card style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
          <div className="type-caption" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            Suspended Stores
          </div>
          <div className="type-h2" style={{ color: '#dc2626', marginTop: 'var(--space-1)' }} data-testid="metric-suspended">
            {suspendedCount}
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div
        role="tablist"
        aria-label="Merchant Status Filter"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {(['all', 'pending', 'active', 'suspended'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={filter === tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              border: 'none',
              background: 'transparent',
              borderBottom: filter === tab ? '2px solid var(--color-primary, #0070f3)' : '2px solid transparent',
              color: filter === tab ? 'var(--color-primary, #0070f3)' : 'var(--text-secondary, #6b7280)',
              fontWeight: filter === tab ? 600 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontSize: '0.875rem',
            }}
            data-testid={`tab-filter-${tab}`}
          >
            {tab} {tab === 'pending' && pendingCount > 0 ? `(${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {/* Merchants Table */}
      <Card style={{ overflow: 'hidden' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '0.875rem',
          }}
          data-testid="merchants-table"
        >
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--color-bg, #f9fafb)',
                borderBottom: '1px solid var(--border-color, #e5e7eb)',
              }}
            >
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Store Name</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Slug</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Owner Email</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Status</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>Applied Date</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStores.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
                  No merchants found for &ldquo;{filter}&rdquo; status.
                </td>
              </tr>
            ) : (
              filteredStores.map((store) => (
                <tr
                  key={store.id}
                  style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}
                  data-testid={`store-row-${store.id}`}
                >
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>{store.name}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <code style={{ fontSize: '0.85em', color: 'var(--text-secondary, #6b7280)' }}>{store.slug}</code>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>{store.ownerEmail}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor:
                          store.status === 'active'
                            ? '#dcfce7'
                            : store.status === 'pending'
                              ? '#fef3c7'
                              : '#fee2e2',
                        color:
                          store.status === 'active'
                            ? '#166534'
                            : store.status === 'pending'
                              ? '#92400e'
                              : '#991b1b',
                      }}
                      data-testid={`status-badge-${store.id}`}
                    >
                      {store.status}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-secondary, #6b7280)' }}>
                    {new Date(store.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                    {store.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleApprove(store.id, store.name);
                        }}
                        disabled={processingId === store.id}
                        data-testid={`approve-btn-${store.id}`}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          cursor: processingId === store.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {processingId === store.id ? 'Approving...' : 'Approve'}
                      </button>
                    )}
                    {store.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleSuspend(store.id, store.name);
                        }}
                        disabled={processingId === store.id}
                        data-testid={`suspend-btn-${store.id}`}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '4px',
                          border: '1px solid #dc2626',
                          backgroundColor: 'transparent',
                          color: '#dc2626',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          cursor: processingId === store.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {processingId === store.id ? 'Suspending...' : 'Suspend'}
                      </button>
                    )}
                    {store.status === 'suspended' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #6b7280)' }}>
                        Suspended
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
