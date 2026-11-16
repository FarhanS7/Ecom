'use client';

// @shopscale/web features/seller/orders/seller-orders-table - Merchant orders management view (T057).
// Invariants:
// 1. Lists only suborders belonging to the authorized store.
// 2. Formats integer cents to USD.
// 3. Displays fulfillment status badges and direct links to suborder fulfillment manager.

import Link from 'next/link';
import type { SellerSuborderDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';
import { FulfillmentStatusBadge } from '@/features/orders/customer-orders';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function SellerOrdersTable({
  storeId,
  suborders,
}: {
  storeId: string;
  suborders: SellerSuborderDto[];
}) {
  if (suborders.length === 0) {
    return (
      <Card className="ss-form-card" data-testid="empty-seller-orders">
        <p>No orders have been received by your store yet.</p>
      </Card>
    );
  }

  return (
    <div className="ss-table-container" data-testid="seller-orders-table">
      <table className="ss-table">
        <thead>
          <tr>
            <th scope="col">Suborder ID</th>
            <th scope="col">Date</th>
            <th scope="col">Status</th>
            <th scope="col">Total</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {suborders.map((so) => (
            <tr key={so.id} data-testid={`suborder-row-${so.id}`}>
              <td>
                <code>{so.id.slice(0, 8)}...</code>
              </td>
              <td>{new Date(so.createdAt).toLocaleDateString()}</td>
              <td>
                <FulfillmentStatusBadge status={so.fulfillmentStatus} />
              </td>
              <td>
                <strong>{formatCents(so.totalCents)}</strong>
              </td>
              <td>
                <Link
                  href={`/seller/${storeId}/orders/${so.id}`}
                  className="ss-btn ss-btn--secondary"
                  data-testid={`manage-suborder-${so.id}`}
                >
                  Manage Fulfillment &rarr;
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
