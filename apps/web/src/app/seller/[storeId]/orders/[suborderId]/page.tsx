// @shopscale/web app/seller/[storeId]/orders/[suborderId]/page.tsx - Suborder detail & fulfillment manager (T057).
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { SellerSuborderDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';
import { apiBaseUrl } from '@/lib/api';
import { FulfillmentStatusBadge } from '@/features/orders/customer-orders';
import { FulfillmentActionModal } from '@/features/seller/orders/fulfillment-action-modal';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Manage Suborder Fulfillment',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function loadSuborderDetail(
  storeId: string,
  suborderId: string,
): Promise<SellerSuborderDto | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  try {
    const res = await fetch(
      `${base}/v1/seller/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(suborderId)}`,
      {
        headers: {
          cookie: cookies().toString(),
          accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as SellerSuborderDto;
  } catch {
    return null;
  }
}

export default async function SellerSuborderDetailPage({
  params,
}: {
  params: { storeId: string; suborderId: string };
}) {
  const suborder = await loadSuborderDetail(params.storeId, params.suborderId);
  if (!suborder) {
    notFound();
  }

  return (
    <div className="ss-suborder-detail-page" data-testid="seller-suborder-detail-page">
      <Link
        href={`/seller/${params.storeId}/orders`}
        className="text-muted"
        style={{ display: 'inline-block', marginBottom: 'var(--space-3)' }}
      >
        &larr; Back to store orders
      </Link>

      <header style={{ marginBottom: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Suborder Fulfillment</h2>
          <p className="type-caption text-muted">
            Suborder: <code>{suborder.id}</code> &bull; Parent Order: <code>{suborder.orderId}</code>
          </p>
          <p className="type-caption text-muted">
            Received: {new Date(suborder.createdAt).toLocaleString()}
          </p>
        </div>
        <FulfillmentStatusBadge status={suborder.fulfillmentStatus} />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Left Column: Fulfillment Workflow Controls */}
        <div>
          <FulfillmentActionModal storeId={params.storeId} suborder={suborder} />

          {/* Delivery Address Snapshot */}
          <section aria-labelledby="delivery-title" style={{ marginTop: 'var(--space-6)' }}>
            <h3 id="delivery-title">Shipping Address</h3>
            <Card data-testid="seller-address-card">
              {suborder.shippingAddress ? (
                <div>
                  <p><strong>{suborder.shippingAddress.fullName}</strong></p>
                  <p>{suborder.shippingAddress.line1}</p>
                  {suborder.shippingAddress.line2 && <p>{suborder.shippingAddress.line2}</p>}
                  <p>
                    {suborder.shippingAddress.city}, {suborder.shippingAddress.state} {suborder.shippingAddress.postalCode}
                  </p>
                  <p>{suborder.shippingAddress.country}</p>
                  {suborder.shippingAddress.phone && (
                    <p className="type-caption text-muted">Phone: {suborder.shippingAddress.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted">No address snapshot available.</p>
              )}
            </Card>
          </section>
        </div>

        {/* Right Column: Ordered Items and Financials */}
        <div>
          <section aria-labelledby="items-title">
            <h3 id="items-title">Items to Fulfill</h3>
            <Card data-testid="seller-items-card">
              <ul className="ss-item-list" style={{ listStyle: 'none', padding: 0 }}>
                {(suborder.items ?? []).map((item) => (
                  <li key={item.id} className="ss-cart-item" data-testid={`seller-item-${item.id}`}>
                    <div className="ss-cart-item__info">
                      <p className="ss-cart-item__title">{item.title}</p>
                      <p className="ss-cart-item__price type-caption">
                        SKU: <code>{item.sku}</code> &bull; Qty: {item.qty} &times; {formatCents(item.unitPriceCents)}
                      </p>
                    </div>
                    <div>
                      <strong>{formatCents(item.totalCents)}</strong>
                    </div>
                  </li>
                ))}
              </ul>

              <hr style={{ margin: 'var(--space-4) 0', border: 'none', borderTop: '1px solid var(--surface-border)' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span>Subtotal:</span>
                <span>{formatCents(suborder.subtotalCents)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span>Shipping:</span>
                <span>{formatCents(suborder.shippingCents)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px' }}>
                <span>Suborder Total:</span>
                <span>{formatCents(suborder.totalCents)}</span>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
