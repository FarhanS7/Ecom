// @shopscale/web app/seller/[storeId]/coupons/page.tsx - Store promotional coupons page (OR-9 / T063).

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { CouponDto, ListCouponsResponse } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { CouponManagement } from '@/features/seller/coupon-management';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Store Coupons & Promotions',
};

async function loadStoreCoupons(storeId: string): Promise<CouponDto[] | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return [];
  }

  try {
    const res = await fetch(`${base}/v1/seller/stores/${encodeURIComponent(storeId)}/coupons`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      return [];
    }

    const data = (await res.json()) as ListCouponsResponse;
    return data.coupons ?? [];
  } catch {
    return [];
  }
}

export default async function SellerCouponsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const coupons = await loadStoreCoupons(params.storeId);
  if (coupons === null) {
    notFound();
  }

  return (
    <div className="ss-store-coupons-page">
      <CouponManagement storeId={params.storeId} initialCoupons={coupons} />
    </div>
  );
}
