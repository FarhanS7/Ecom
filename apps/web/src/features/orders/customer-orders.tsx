'use client';

// @shopscale/web features/orders/customer-orders - Customer order views (T057).
// Invariants:
// 1. Renders customer order list with status badges and timestamps.
// 2. Renders multi-seller order detail with independent progress steppers and item breakdowns per vendor.
// 3. Displays delivery address snapshot and integer cents formatted to USD currency.

import Link from 'next/link';
import type { CustomerOrderDetailDto, CustomerOrderDto } from '@shopscale/contracts';
import { Card, Tag } from '@/components/ui';
import { OrderProgressStepper } from './progress-stepper';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'PAID':
      return <Tag tone="positive">Paid</Tag>;
    case 'PENDING':
      return <Tag tone="warning">Payment Pending</Tag>;
    case 'FAILED':
      return <Tag tone="accent">Payment Failed</Tag>;
    case 'REFUNDED':
      return <Tag tone="accent">Refunded</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

export function FulfillmentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'DELIVERED':
      return <Tag tone="positive">Delivered</Tag>;
    case 'SHIPPED':
      return <Tag tone="positive">Shipped</Tag>;
    case 'PARTIALLY_SHIPPED':
      return <Tag tone="positive">Partially Shipped</Tag>;
    case 'PARTIALLY_DELIVERED':
      return <Tag tone="positive">Partially Delivered</Tag>;
    case 'PACKED':
      return <Tag tone="warning">Packed</Tag>;
    case 'PENDING':
      return <Tag tone="warning">Processing</Tag>;
    case 'CANCELLED':
      return <Tag tone="accent">Cancelled</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

export function CustomerOrderList({ orders }: { orders: CustomerOrderDto[] }) {
  if (orders.length === 0) {
    return (
      <Card className="ss-form-card" data-testid="empty-orders-card">
        <p>You have not placed any orders yet.</p>
        <Link href="/products" className="ss-btn ss-btn--primary">
          Browse Catalog
        </Link>
      </Card>
    );
  }

  return (
    <div className="ss-orders-list" data-testid="customer-orders-list">
      {orders.map((order) => (
        <Card key={order.id} className="ss-order-card" data-testid={`order-card-${order.id}`}>
          <div className="ss-order-card__header">
            <div>
              <p className="type-caption text-muted">Order ID: <code>{order.id}</code></p>
              <p className="type-caption">Placed: {new Date(order.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="ss-order-card__badges">
              <PaymentStatusBadge status={order.paymentStatus} />
              <FulfillmentStatusBadge status={order.fulfillmentStatus} />
            </div>
          </div>

          <div className="ss-order-card__body">
            <p>
              <strong>Total:</strong> {formatCents(order.totalCents)} ({order.itemsCount ?? 1} item{order.itemsCount === 1 ? '' : 's'})
            </p>
          </div>

          <div className="ss-order-card__footer">
            <Link
              href={`/account/orders/${order.id}`}
              className="ss-btn ss-btn--secondary"
              data-testid={`view-order-${order.id}`}
            >
              View Order & Tracking &rarr;
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function CustomerOrderDetail({ order }: { order: CustomerOrderDetailDto }) {
  return (
    <div className="ss-order-detail" data-testid="customer-order-detail">
      <div className="ss-order-detail__header">
        <Link href="/account/orders" className="text-muted" style={{ display: 'inline-block', marginBottom: 'var(--space-2)' }}>
          &larr; Back to all orders
        </Link>
        <h1>Order Tracking</h1>
        <p className="type-caption text-muted">
          Order ID: <code>{order.id}</code> &bull; Placed: {new Date(order.createdAt).toLocaleString()}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', alignItems: 'center' }}>
          <PaymentStatusBadge status={order.paymentStatus} />
          <FulfillmentStatusBadge status={order.fulfillmentStatus} />
          {order.fulfillmentStatus === 'DELIVERED' && (
            <div style={{ marginLeft: 'auto' }}>
              <Link
                href={`/account/orders/${order.id}/return`}
                className="ss-btn ss-btn--secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
              >
                Request a Return
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Multi-seller package breakdown */}
      <section aria-labelledby="packages-title" style={{ marginTop: 'var(--space-6)' }}>
        <h2 id="packages-title">Packages & Fulfillment</h2>
        {order.suborders.map((suborder, idx) => (
          <Card key={suborder.id} className="ss-suborder-card" data-testid={`suborder-card-${suborder.id}`}>
            <header className="ss-suborder-card__header">
              <h3>Package {idx + 1} of {order.suborders.length}</h3>
              <FulfillmentStatusBadge status={suborder.fulfillmentStatus} />
            </header>

            <OrderProgressStepper
              paymentStatus={order.paymentStatus}
              fulfillmentStatus={suborder.fulfillmentStatus}
              trackingRef={suborder.trackingRef}
              carrier={suborder.carrier}
              shippedAt={suborder.shippedAt}
              deliveredAt={suborder.deliveredAt}
            />

            <div className="ss-suborder-items">
              <h4>Items in this package</h4>
              <ul className="ss-item-list" style={{ listStyle: 'none', padding: 0 }}>
                {(suborder.items ?? []).map((item) => (
                  <li key={item.id} className="ss-cart-item" data-testid={`item-${item.id}`}>
                    <div className="ss-cart-item__info">
                      <p className="ss-cart-item__title">{item.title}</p>
                      <p className="ss-cart-item__price type-caption">
                        SKU: {item.sku} &bull; Qty: {item.qty} &times; {formatCents(item.unitPriceCents)}
                      </p>
                    </div>
                    <div>
                      <strong>{formatCents(item.totalCents)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </section>

      {/* Shipping Address Snapshot */}
      <section aria-labelledby="shipping-address-title" style={{ marginTop: 'var(--space-6)' }}>
        <h2 id="shipping-address-title">Delivery Address</h2>
        <Card className="ss-address-card" data-testid="delivery-address-card">
          <p><strong>{order.address.fullName}</strong></p>
          <p>{order.address.line1}</p>
          {order.address.line2 && <p>{order.address.line2}</p>}
          <p>{order.address.city}, {order.address.state} {order.address.postalCode}</p>
          <p>{order.address.country}</p>
          {order.address.phone && <p className="type-caption text-muted">Phone: {order.address.phone}</p>}
        </Card>
      </section>

      {/* Financial Breakdown */}
      <section aria-labelledby="order-summary-title" style={{ marginTop: 'var(--space-6)' }}>
        <h2 id="order-summary-title">Payment Summary</h2>
        <Card className="ss-summary-card" data-testid="payment-summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <span>Subtotal:</span>
            <span>{formatCents(order.subtotalCents)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <span>Shipping:</span>
            <span>{formatCents(order.shippingCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)', color: 'var(--color-positive)' }}>
              <span>Discount ({order.couponCode ?? 'Coupon'}):</span>
              <span>-{formatCents(order.discountCents)}</span>
            </div>
          )}
          <hr style={{ margin: 'var(--space-3) 0', border: 'none', borderTop: '1px solid var(--surface-border)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '18px' }}>
            <span>Total:</span>
            <span>{formatCents(order.totalCents)}</span>
          </div>
        </Card>
      </section>
    </div>
  );
}
