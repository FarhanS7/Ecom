'use server';

// @shopscale/web features/returns/actions - Customer return requests and seller inspection actions (T059).
// Invariants:
// 1. UUID validation before sending requests to the API.
// 2. Uses session cookie server-to-server.
// 3. Validates payloads against contracts schemas.
// 4. Returns typed success/error outcomes.

import { cookies } from 'next/headers';
import type {
  CreateReturnRequestDto,
  InspectReturnRequestDto,
  ReturnRequestDto,
  SellerReturnRequestDto,
} from '@shopscale/contracts';
import {
  createReturnRequestSchema,
  inspectReturnRequestSchema,
} from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { UUID_PATTERN } from '@/features/seller/load';

export type CreateReturnActionResult =
  | { ok: true; data: ReturnRequestDto }
  | { ok: false; error: string };

export type InspectReturnActionResult =
  | { ok: true; data: SellerReturnRequestDto }
  | { ok: false; error: string };

export async function createReturnRequestAction(
  orderId: string,
  payload: CreateReturnRequestDto,
): Promise<CreateReturnActionResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, error: 'Invalid order identifier.' };
  }

  const parseResult = createReturnRequestSchema.safeParse(payload);
  if (!parseResult.success) {
    return { ok: false, error: parseResult.error.issues[0]?.message ?? 'Invalid return request data.' };
  }

  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return { ok: false, error: 'API base URL is not configured.' };
  }

  try {
    const res = await fetch(`${base}/v1/orders/${orderId}/returns`, {
      method: 'POST',
      headers: {
        cookie: cookies().toString(),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(parseResult.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      let errorMsg = `Return request failed with status ${res.status}.`;
      try {
        const body = (await res.json()) as { message?: string; detail?: string };
        if (body.message) errorMsg = body.message;
        else if (body.detail) errorMsg = body.detail;
      } catch {
        // Fallback
      }
      return { ok: false, error: errorMsg };
    }

    const data = (await res.json()) as ReturnRequestDto;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error submitting return request.',
    };
  }
}

export async function inspectReturnRequestAction(
  storeId: string,
  returnId: string,
  payload: InspectReturnRequestDto,
): Promise<InspectReturnActionResult> {
  if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(returnId)) {
    return { ok: false, error: 'Invalid store or return identifier.' };
  }

  const parseResult = inspectReturnRequestSchema.safeParse(payload);
  if (!parseResult.success) {
    return { ok: false, error: parseResult.error.issues[0]?.message ?? 'Invalid inspection data.' };
  }

  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return { ok: false, error: 'API base URL is not configured.' };
  }

  try {
    const res = await fetch(
      `${base}/v1/seller/stores/${storeId}/returns/${returnId}/inspect`,
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
      let errorMsg = `Inspection failed with status ${res.status}.`;
      try {
        const body = (await res.json()) as { message?: string; detail?: string };
        if (body.message) errorMsg = body.message;
        else if (body.detail) errorMsg = body.detail;
      } catch {
        // Fallback
      }
      return { ok: false, error: errorMsg };
    }

    const data = (await res.json()) as SellerReturnRequestDto;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error inspecting return request.',
    };
  }
}
