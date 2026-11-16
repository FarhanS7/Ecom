// @shopscale/web app/seller/[storeId]/returns/page.tsx - Seller return queue console (T059).
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { SellerReturnRequestDto } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { UUID_PATTERN } from '@/features/seller/load';
import { SellerReturnsTable } from '@/features/returns/seller-returns-table';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Return Requests',
};

async function loadStoreReturns(storeId: string): Promise<SellerReturnRequestDto[] | null> {
  if (!UUID_PATTERN.test(storeId)) return null;

  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${base}/v1/seller/stores/${encodeURIComponent(storeId)}/returns`, {
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

    return (await res.json()) as SellerReturnRequestDto[];
  } catch {
    return null;
  }
}

export default async function SellerReturnsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const returns = await loadStoreReturns(params.storeId);
  if (returns === null) {
    notFound();
  }

  return (
    <section aria-labelledby="seller-returns-title" className="ss-console__panel">
      <SellerReturnsTable storeId={params.storeId} initialReturns={returns} />
    </section>
  );
}
