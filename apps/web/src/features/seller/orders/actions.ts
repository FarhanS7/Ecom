'use server';

// @shopscale/web features/seller/orders/actions - Seller fulfillment server actions (T057).
// Invariants:
// 1. UUID validation before sending requests to the API.
// 2. Uses session cookie server-to-server.
// 3. Validates transition request payload against fulfillmentTransitionSchema.
// 4. Returns typed success/error outcomes.

import { cookies } from 'next/headers';
import type {
  FulfillmentTransitionDto,
  SuborderTransitionResponseDto,
} from '@shopscale/contracts';
import { fulfillmentTransitionSchema } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { UUID_PATTERN } from '@/features/seller/load';

export type FulfillmentActionResult =
  | { ok: true; data: SuborderTransitionResponseDto }
  | { ok: false; error: string };

export async function transitionSuborderAction(
  storeId: string,
  suborderId: string,
  payload: FulfillmentTransitionDto,
): Promise<FulfillmentActionResult> {
  if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(suborderId)) {
    return { ok: false, error: 'Invalid store or suborder identifier.' };
  }

  const parseResult = fulfillmentTransitionSchema.safeParse(payload);
  if (!parseResult.success) {
    return { ok: false, error: parseResult.error.issues[0]?.message ?? 'Invalid transition data.' };
  }

  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return { ok: false, error: 'API base URL is not configured.' };
  }

  try {
    const res = await fetch(
      `${base}/v1/seller/stores/${storeId}/orders/${suborderId}/transitions`,
      {
        method: 'POST',
        headers: {
          cookie: cookies().toString(),
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(parseResult.data),
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      let errorMsg = `Transition failed with status ${res.status}.`;
      try {
        const body = (await res.json()) as { message?: string; detail?: string };
        if (body.message) errorMsg = body.message;
        else if (body.detail) errorMsg = body.detail;
      } catch {
        // Fallback to generic message
      }
      return { ok: false, error: errorMsg };
    }

    const data = (await res.json()) as SuborderTransitionResponseDto;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error advancing fulfillment state.',
    };
  }
}
