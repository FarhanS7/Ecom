// @shopscale/web app/account/orders/page.tsx - Customer order history page (T057).
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PaginatedOrdersResponseDto } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { currentSessionEmail } from '@/lib/session-server';
import { CustomerOrderList } from '@/features/orders/customer-orders';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Order History',
};

async function loadOrders(): Promise<PaginatedOrdersResponseDto> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return { items: [], nextCursor: null };
  }

  try {
    const res = await fetch(`${base}/v1/orders?limit=50`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { items: [], nextCursor: null };
    }

    return (await res.json()) as PaginatedOrdersResponseDto;
  } catch {
    return { items: [], nextCursor: null };
  }
}

export default async function AccountOrdersPage() {
  const email = await currentSessionEmail();
  if (!email) {
    redirect('/login?next=/account/orders');
  }

  const { items } = await loadOrders();

  return (
    <section aria-labelledby="orders-page-title" className="ss-account-orders">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div>
          <Link href="/account" className="text-muted" style={{ display: 'inline-block', marginBottom: 'var(--space-1)' }}>
            &larr; Back to account
          </Link>
          <h1 id="orders-page-title">Your Orders</h1>
        </div>
      </div>
      <CustomerOrderList orders={items} />
    </section>
  );
}
