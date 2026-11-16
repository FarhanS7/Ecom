// @shopscale/web app/seller/[storeId]/orders/page.tsx - Seller orders list (T057).
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { PaginatedSellerSubordersResponseDto } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { SellerOrdersTable } from '@/features/seller/orders/seller-orders-table';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Store Orders & Fulfillment',
};

async function loadSellerOrders(storeId: string): Promise<PaginatedSellerSubordersResponseDto | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${base}/v1/seller/stores/${encodeURIComponent(storeId)}/orders?limit=50`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      return { items: [], nextCursor: null };
    }

    return (await res.json()) as PaginatedSellerSubordersResponseDto;
  } catch {
    return { items: [], nextCursor: null };
  }
}

export default async function SellerOrdersPage({
  params,
}: {
  params: { storeId: string };
}) {
  const result = await loadSellerOrders(params.storeId);
  if (!result) {
    notFound();
  }

  return (
    <div className="ss-console-orders" data-testid="seller-orders-page">
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h2>Customer Orders</h2>
        <p className="type-caption text-muted">
          Manage fulfillment, packing, and dispatch for orders placed with your store.
        </p>
      </header>

      <SellerOrdersTable storeId={params.storeId} suborders={result.items} />
    </div>
  );
}
