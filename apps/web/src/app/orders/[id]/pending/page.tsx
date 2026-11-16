// @shopscale/web - Order pending status screen (T048).
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Order Received — Payment Pending | ShopScale',
  description: 'Your order has been placed and is awaiting payment processing.',
};

interface PendingOrderPageProps {
  params: { id: string };
}

export default function PendingOrderPage({ params }: PendingOrderPageProps) {
  const orderId = params.id;

  return (
    <div
      className="ss-pending-order-container"
      data-testid="pending-order-screen"
      style={{
        maxWidth: '640px',
        margin: 'var(--space-12) auto',
        padding: 'var(--space-8) var(--space-4)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#eff6ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto var(--space-6)',
        }}
      >
        <span style={{ fontSize: '32px' }} role="img" aria-label="Order received">
          📦
        </span>
      </div>

      <span
        className="ss-status-badge ss-status-badge--pending"
        data-testid="order-status-badge"
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: '9999px',
          fontSize: '0.875rem',
          fontWeight: 600,
          backgroundColor: '#fef3c7',
          color: '#92400e',
          marginBottom: 'var(--space-4)',
        }}
      >
        Payment Pending
      </span>

      <h1 className="type-h2" style={{ marginBottom: 'var(--space-3)' }}>
        Thank you for your order!
      </h1>

      <p className="type-body" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
        We have received your order and reserved your items. Awaiting payment authorization and settlement.
      </p>

      <div
        className="ss-order-meta-card"
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
          backgroundColor: 'var(--surface-subtle, #f9fafb)',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)' }}>
          <span className="type-label" style={{ color: 'var(--text-secondary)' }}>Order ID:</span>
          <span className="type-label" data-testid="pending-order-id" style={{ fontFamily: 'monospace' }}>
            {orderId}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
          <span className="type-label" style={{ color: 'var(--text-secondary)' }}>Status:</span>
          <span className="type-label" style={{ color: '#d97706', fontWeight: 600 }}>
            Awaiting Payment
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center' }}>
        <Link href="/" className="ui-button ui-button--primary" data-testid="continue-shopping-btn">
          Continue Shopping
        </Link>
        <Link href="/account" className="ui-button ui-button--secondary" data-testid="view-account-btn">
          View Account
        </Link>
      </div>
    </div>
  );
}
