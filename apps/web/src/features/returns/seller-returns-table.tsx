'use client';

// @shopscale/web features/returns/seller-returns-table - Seller returns queue and inspection dashboard (T059).
import { useState } from 'react';
import type { SellerReturnRequestDto } from '@shopscale/contracts';
import { ActionButton, Card, Tag } from '@/components/ui';
import { SellerInspectionModal } from './seller-inspection-modal';

export interface SellerReturnsTableProps {
  storeId: string;
  initialReturns: SellerReturnRequestDto[];
}

export function SellerReturnsTable({ storeId, initialReturns }: SellerReturnsTableProps) {
  const [returns, setReturns] = useState<SellerReturnRequestDto[]>(initialReturns);
  const [filter, setFilter] = useState<'ALL' | 'PENDING_INSPECTION' | 'APPROVED' | 'REJECTED'>('ALL');
  const [inspectingReturn, setInspectingReturn] = useState<SellerReturnRequestDto | null>(null);

  const filteredReturns = returns.filter((r) => {
    if (filter === 'ALL') return true;
    return r.status === filter;
  });

  const handleUpdate = (updated: SellerReturnRequestDto) => {
    setReturns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setInspectingReturn(null);
  };

  return (
    <div className="ss-seller-returns" style={{ display: 'grid', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Return Requests Queue</h2>
          <p className="type-caption">
            Inspect returned items physically and record approval (with restocking) or rejection decisions.
          </p>
        </div>
      </header>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
        {(['ALL', 'PENDING_INSPECTION', 'APPROVED', 'REJECTED'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: filter === tab ? 'var(--color-bg-subtle, #e0e7ff)' : 'transparent',
              fontWeight: filter === tab ? 600 : 400,
              color: filter === tab ? 'var(--color-primary, #4338ca)' : 'inherit',
              cursor: 'pointer',
            }}
          >
            {tab === 'ALL' ? 'All Returns' : tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {filteredReturns.length === 0 ? (
        <Card className="ss-form-card">
          <p className="type-caption" style={{ textAlign: 'center', padding: '2rem 0', fontStyle: 'italic' }}>
            No return requests match this filter.
          </p>
        </Card>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            className="ss-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.875rem',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Item & SKU</th>
                <th style={{ padding: '0.75rem 1rem' }}>Qty</th>
                <th style={{ padding: '0.75rem 1rem' }}>Reason & Notes</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredReturns.map((ret) => {
                let tone: 'default' | 'positive' | 'warning' = 'default';
                if (ret.status === 'PENDING_INSPECTION') tone = 'warning';
                if (ret.status === 'APPROVED') tone = 'positive';

                const formattedDate = new Date(ret.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <tr
                    key={ret.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      background: '#fff',
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      {formattedDate}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600 }}>{ret.itemTitle}</div>
                      <div className="type-caption" style={{ color: '#6b7280' }}>
                        SKU: {ret.itemSku}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', fontWeight: 600 }}>
                      {ret.qty}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', maxWidth: '280px' }}>
                      <div>{ret.reason}</div>
                      {ret.customerNotes && (
                        <div className="type-caption" style={{ color: '#6b7280', marginTop: '0.25rem' }}>
                          Customer: &ldquo;{ret.customerNotes}&rdquo;
                        </div>
                      )}
                      {ret.inspectionNotes && (
                        <div className="type-caption" style={{ color: '#1f2937', marginTop: '0.25rem' }}>
                          Inspection: <em>{ret.inspectionNotes}</em>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                      <Tag tone={tone}>{ret.status.replace('_', ' ')}</Tag>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top', textAlign: 'right' }}>
                      {ret.status === 'PENDING_INSPECTION' ? (
                        <ActionButton
                          type="button"
                          onClick={() => setInspectingReturn(ret)}
                          variant="primary"
                        >
                          Inspect
                        </ActionButton>
                      ) : (
                        <span className="type-caption" style={{ color: '#9ca3af' }}>
                          Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {inspectingReturn && (
        <SellerInspectionModal
          storeId={storeId}
          returnRequest={inspectingReturn}
          onClose={() => setInspectingReturn(null)}
          onSuccess={handleUpdate}
        />
      )}
    </div>
  );
}
