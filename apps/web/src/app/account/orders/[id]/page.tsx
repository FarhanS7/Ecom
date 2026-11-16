// @shopscale/web app/account/orders/[id]/page.tsx - Customer order tracking & detail page (T057).
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { CustomerOrderDetailDto } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { currentSessionEmail } from '@/lib/session-server';
import { CustomerOrderDetail } from '@/features/orders/customer-orders';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Order Tracking',
};

async function loadOrderDetail(orderId: string): Promise<CustomerOrderDetailDto | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${base}/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as CustomerOrderDetailDto;
  } catch {
    return null;
  }
}

export default async function AccountOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const email = await currentSessionEmail();
  if (!email) {
    redirect(`/login?next=/account/orders/${params.id}`);
  }

  const order = await loadOrderDetail(params.id);
  if (!order) {
    notFound();
  }

  return (
    <section aria-labelledby="order-tracking-title" className="ss-account-order-detail">
      <CustomerOrderDetail order={order} />
    </section>
  );
}
