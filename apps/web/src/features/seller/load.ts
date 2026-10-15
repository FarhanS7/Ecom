// @shopscale/web features/seller/load - Server-only seller console data access
// (T027b). SERVER components and server actions only: it reads API_BASE_URL and
// forwards the browser's session cookies server-to-server, the same trust path
// as lib/session-server's `/v1/auth/me` read.
//
// The browser never calls these paths. No seller route is on the gateway
// allowlist, so a client that ignores the console UI cannot reach the seller
// read OR write API at all (ADR-0010 decision 5) — the gateway keeps refusing
// them, and authorization stays in NestJS.
//
// Outcomes are deliberately coarse. The API collapses "unknown store",
// "non-member", "member without catalog:manage" and "bad input" into ONE
// generic 404 (the T018 no-oracle rule), so the console must not invent a
// distinction it cannot observe: `not-found` is that single answer. An outage
// is never `not-found` — "I could not reach the store console" is not evidence
// that the store is not yours.

import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  productResponse,
  sellerProductListResponse,
  storeMembershipResponse,
  variantListResponse,
} from '@shopscale/contracts';
import type {
  ProductResponse,
  StoreMembershipResponse,
  VariantResponse,
} from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';

const TIMEOUT_MS = 5000;

/** Every seller route id is a uuid; the API answers 404 for anything else, and
 * a bad id must never be interpolated into a path. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSellerId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Read outcome. `conflict` and the write-only cases are flattened away. */
export type SellerRead<T> =
  | { status: 'ok'; data: T }
  | { status: 'not-found' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Raw call outcome, including the two cases only a write can produce. */
export type SellerCall<T> =
  | { status: 'ok'; data: T }
  | { status: 'conflict'; message: string }
  | { status: 'not-found' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
}

function requireId(value: string): string {
  // Path builders refuse a non-uuid rather than building a traversable path
  // (`..` would otherwise normalise the request into another API route).
  if (!UUID_PATTERN.test(value)) throw new Error('Seller ids must be uuids.');
  return value;
}

export function sellerMembershipPath(storeId: string): string {
  return `/v1/seller/stores/${requireId(storeId)}/membership`;
}

export function sellerProductsPath(storeId: string): string {
  return `/v1/seller/stores/${requireId(storeId)}/products`;
}

export function sellerProductPath(storeId: string, productId: string): string {
  return `${sellerProductsPath(storeId)}/${requireId(productId)}`;
}

export function sellerVariantsPath(storeId: string, productId: string): string {
  return `${sellerProductPath(storeId, productId)}/variants`;
}

export function sellerVariantPath(storeId: string, productId: string, variantId: string): string {
  return `${sellerVariantsPath(storeId, productId)}/${requireId(variantId)}`;
}

export function sellerPublicationPath(storeId: string, productId: string): string {
  return `${sellerProductPath(storeId, productId)}/publication`;
}

export function sellerArchivePath(storeId: string, productId: string): string {
  return `${sellerProductPath(storeId, productId)}/archive`;
}

/** Problem+JSON detail/title. The API keeps these constant and non-revealing
 * on scoped routes, so surfacing the text does not leak scope information. */
async function problemMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; title?: unknown };
    if (typeof body.detail === 'string' && body.detail !== '') return body.detail;
    if (typeof body.title === 'string' && body.title !== '') return body.title;
  } catch {
    /* fall through to the generic message */
  }
  return 'That change conflicts with a newer version.';
}

/** One place where an API response becomes a console outcome. */
export async function sellerFetch<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown },
  schema: Schema<T>,
): Promise<SellerCall<T>> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    // No API configured is an outage, not an empty console.
    return { status: 'unavailable' };
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    cookie: cookies().toString(),
  };
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: init.method,
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    return { status: 'unavailable' };
  }

  if (response.status === 404) return { status: 'not-found' };
  if (response.status === 401) return { status: 'unauthenticated' };
  if (response.status === 409) {
    return { status: 'conflict', message: await problemMessage(response) };
  }
  if (!response.ok) return { status: 'unavailable' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'unavailable' };
  }
  const parsed = schema.safeParse(body);
  // A body outside the contract is an outage of trust, not a not-found.
  if (!parsed.success) return { status: 'unavailable' };
  return { status: 'ok', data: parsed.data };
}

function toRead<T>(call: SellerCall<T>): SellerRead<T> {
  // A read never conflicts: a 409 on a GET would be an API bug, and reporting
  // the console as unavailable is honest (nothing was read).
  return call.status === 'conflict' ? { status: 'unavailable' } : call;
}

/**
 * The caller's membership in this store. This is the console's gate: the API
 * answers 404 for a non-member exactly as it does for an unknown store, so a
 * seller can never learn that someone else's store exists.
 *
 * `cache()` is keyed on the primitive store id, so the layout and the page in
 * one request share a single call (and one cache node per store).
 */
export const loadMembership = cache(
  async (storeId: string): Promise<SellerRead<StoreMembershipResponse>> => {
    if (!isSellerId(storeId)) return { status: 'not-found' };
    return toRead(
      await sellerFetch(sellerMembershipPath(storeId), { method: 'GET' }, storeMembershipResponse),
    );
  },
);

/** Products in the seller's own store, newest first (the API's ordering). */
export async function loadSellerProducts(
  storeId: string,
): Promise<SellerRead<ProductResponse[]>> {
  if (!isSellerId(storeId)) return { status: 'not-found' };
  const call = await sellerFetch(
    sellerProductsPath(storeId),
    { method: 'GET' },
    sellerProductListResponse,
  );
  return call.status === 'ok' ? { status: 'ok', data: call.data.items } : toRead(call);
}

/** One store-scoped product, or a definite not-found. */
export const loadSellerProduct = cache(
  async (storeId: string, productId: string): Promise<SellerRead<ProductResponse>> => {
    if (!isSellerId(storeId) || !isSellerId(productId)) return { status: 'not-found' };
    return toRead(
      await sellerFetch(sellerProductPath(storeId, productId), { method: 'GET' }, productResponse),
    );
  },
);

/** Variants of a store-scoped product. */
export async function loadVariants(
  storeId: string,
  productId: string,
): Promise<SellerRead<VariantResponse[]>> {
  if (!isSellerId(storeId) || !isSellerId(productId)) return { status: 'not-found' };
  const call = await sellerFetch(
    sellerVariantsPath(storeId, productId),
    { method: 'GET' },
    variantListResponse,
  );
  return call.status === 'ok' ? { status: 'ok', data: call.data.items } : toRead(call);
}
