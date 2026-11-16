// @shopscale/web app/account/orders/[id]/return/page.tsx - Customer return request page (T059).
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { CustomerOrderDetailDto, ReturnRequestDto } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { currentSessionEmail } from '@/lib/session-server';
import { ReturnForm } from '@/features/returns/return-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Request a Return',
};

async function loadOrderAndReturns(
  orderId: string,
): Promise<{ order: CustomerOrderDetailDto; returns: ReturnRequestDto[] } | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  const cookieHeader = cookies().toString();

  try {
    const [orderRes, returnsRes] = await Promise.all([
      fetch(`${base}/v1/orders/${encodeURIComponent(orderId)}`, {
        headers: { cookie: cookieHeader, accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${base}/v1/orders/${encodeURIComponent(orderId)}/returns`, {
        headers: { cookie: cookieHeader, accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    if (!orderRes.ok) {
      return null;
    }

    const order = (await orderRes.json()) as CustomerOrderDetailDto;
    const returns = returnsRes.ok ? ((await returnsRes.json()) as ReturnRequestDto[]) : [];

    return { order, returns };
  } catch {
    return null;
  }
}

export default async function AccountOrderReturnPage({
  params,
}: {
  params: { id: string };
}) {
  const email = await currentSessionEmail();
  if (!email) {
    redirect(`/login?next=/account/orders/${params.id}/return`);
  }

  const data = await loadOrderAndReturns(params.id);
  if (!data) {
    notFound();
  }

  return (
    <section aria-labelledby="return-request-title" className="ss-account-order-return" style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={`/account/orders/${params.id}`} className="text-muted" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
          &larr; Back to order details
        </Link>
        <h1 id="return-request-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
          Order Return Request
        </h1>
        <p className="type-caption text-muted">
          Order ID: <code>{data.order.id}</code>
        </p>
      </div>

      <ReturnForm order={data.order} existingReturns={data.returns} />
    </section>
  );
}
