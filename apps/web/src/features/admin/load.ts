// @shopscale/web features/admin/load - Server-only platform admin data access (T069).
// Forwards cookies to NestJS backend, enforcing platform admin verification.

import { cookies } from 'next/headers';
import { apiBaseUrl } from '@/lib/api';
import type { AdminSellerSummaryDto, CategoryDto } from '@shopscale/contracts';

const TIMEOUT_MS = 5000;

export async function loadAdminStores(status?: string): Promise<AdminSellerSummaryDto[] | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  try {
    const res = await fetch(`${base}/v1/admin/stores${query}`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { items?: AdminSellerSummaryDto[] };
    return data.items ?? [];
  } catch {
    return null;
  }
}

export async function loadAdminCategories(): Promise<CategoryDto[] | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${base}/v1/categories`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { items?: CategoryDto[] };
    return data.items ?? [];
  } catch {
    return null;
  }
}
