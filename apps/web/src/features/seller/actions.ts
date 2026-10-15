'use server';

// @shopscale/web features/seller/actions - Seller console server actions
// (T027b). Every mutation runs HERE, on the Next server, before anything
// reaches the API:
//
//   1. ids are proven to be uuids (a bad id never becomes a request path),
//   2. the submitted values are validated with the SAME contract schemas the
//      API enforces, so a client that ignores the form cannot ignore the rules,
//   3. the API is called server-to-server with the session cookie.
//
// The browser has no allowlisted route to the seller write endpoints
// (ADR-0010 decision 5), so this is the only door — and it is the reason
// "server validation" is not a figure of speech here.
//
// Optimistic concurrency is treated as a UX flow: a 409 re-reads the product
// and returns it, so the console can offer "reload latest" or "apply my
// changes" instead of an error wall.

import type { ProductResponse, VariantResponse } from '@shopscale/contracts';
import {
  loadSellerProduct,
  isSellerId,
  type SellerCall,
  type SellerRead,
} from '@/features/seller/load';
import * as api from '@/features/seller/client';
import {
  validateProductCreate,
  validateProductUpdate,
  validateVariantCreate,
  validateVariantUpdate,
} from '@/features/seller/validation';
import type {
  ArchiveInput,
  ProductSaveInput,
  ProductSaveState,
  PublicationInput,
  SellerFailure,
  StatusInput,
  VariantSaveInput,
  VariantSaveState,
} from '@/features/seller/state';

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Turn an API failure into console state. A version conflict re-reads the
 * product so "reload latest" / "apply my changes" have something real to work
 * with; a failed re-read is reported honestly (`current: null`) rather than
 * guessed. `productId === null` (a create) has no version to conflict with.
 */
async function toFailure(
  call: SellerCall<unknown>,
  storeId: string,
  productId: string | null,
): Promise<SellerFailure> {
  if (call.status === 'not-found') return { status: 'not-found' };
  if (call.status === 'unauthenticated') return { status: 'unauthenticated' };
  if (call.status !== 'conflict' || productId === null) return { status: 'unavailable' };

  const reread: SellerRead<ProductResponse> = await loadSellerProduct(storeId, productId);
  return {
    status: 'conflict',
    message: call.message,
    current: reread.status === 'ok' ? reread.data : null,
  };
}

/** Create a product (productId null) or save an edit of an existing one. */
export async function saveProduct(input: ProductSaveInput): Promise<ProductSaveState> {
  const { storeId, productId, expectedVersion, values } = input;
  if (!isSellerId(storeId)) return { status: 'not-found' };

  if (productId === null) {
    const validated = validateProductCreate(values);
    if (!validated.ok) return { status: 'invalid', errors: validated.errors };
    const created = await api.createProduct(storeId, validated.data);
    if (created.status === 'ok') return { status: 'saved', product: created.data };
    return toFailure(created, storeId, null);
  }

  if (!isSellerId(productId) || !isPositiveInt(expectedVersion)) return { status: 'not-found' };
  const validated = validateProductUpdate(values, expectedVersion);
  if (!validated.ok) return { status: 'invalid', errors: validated.errors };
  const updated = await api.updateProduct(storeId, productId, validated.data);
  if (updated.status === 'ok') return { status: 'saved', product: updated.data };
  return toFailure(updated, storeId, productId);
}

/**
 * A successful variant write still needs the product re-read: the write bumped
 * the PRODUCT's version, but the response describes the variant. Returning the
 * fresh product keeps the console's next version-carrying write current. When
 * only the re-read fails the write is still reported as saved, with
 * `product: null` (the caller must ask for a reload before editing again).
 */
async function finishVariant(
  call: SellerCall<VariantResponse>,
  storeId: string,
  productId: string,
): Promise<VariantSaveState> {
  if (call.status !== 'ok') return toFailure(call, storeId, productId);
  const reread = await loadSellerProduct(storeId, productId);
  return {
    status: 'saved',
    variant: call.data,
    product: reread.status === 'ok' ? reread.data : null,
  };
}

/** Create a variant (variantId null) or save an edit of an existing one. */
export async function saveVariant(input: VariantSaveInput): Promise<VariantSaveState> {
  const { storeId, productId, variantId, expectedVersion, values } = input;
  if (!isSellerId(storeId) || !isSellerId(productId) || !isPositiveInt(expectedVersion)) {
    return { status: 'not-found' };
  }

  if (variantId === null) {
    const validated = validateVariantCreate(values);
    if (!validated.ok) return { status: 'invalid', errors: validated.errors };
    return finishVariant(await api.createVariant(storeId, productId, validated.data), storeId, productId);
  }

  if (!isSellerId(variantId)) return { status: 'not-found' };
  const validated = validateVariantUpdate(values, expectedVersion);
  if (!validated.ok) return { status: 'invalid', errors: validated.errors };
  return finishVariant(
    await api.updateVariant(storeId, productId, variantId, validated.data),
    storeId,
    productId,
  );
}

/**
 * Flip a channel flag. Independent flags, and NOT version-guarded (T020b):
 * publication is last-write-wins by design, and the response carries the bumped
 * version so the caller can keep editing with a current counter.
 */
export async function savePublication(input: PublicationInput): Promise<ProductSaveState> {
  if (!isSellerId(input.storeId) || !isSellerId(input.productId)) return { status: 'not-found' };

  const patch: { marketplaceEnabled?: boolean; storeEnabled?: boolean } = {};
  if (input.marketplaceEnabled !== undefined) patch.marketplaceEnabled = input.marketplaceEnabled;
  if (input.storeEnabled !== undefined) patch.storeEnabled = input.storeEnabled;

  const call = await api.setPublication(input.storeId, input.productId, patch);
  if (call.status === 'ok') return { status: 'saved', product: call.data };
  return toFailure(call, input.storeId, input.productId);
}

/**
 * Publish (`active`) or unpublish (`draft`). Activation is refused by the API
 * when the product has no active variant — that arrives as a conflict whose
 * message names the reason, which is exactly what the UI shows.
 */
export async function setProductStatus(input: StatusInput): Promise<ProductSaveState> {
  const { storeId, productId, expectedVersion, status } = input;
  if (!isSellerId(storeId) || !isSellerId(productId) || !isPositiveInt(expectedVersion)) {
    return { status: 'not-found' };
  }
  if (status !== 'draft' && status !== 'active') return { status: 'not-found' };

  const call = await api.updateProduct(storeId, productId, { expectedVersion, status });
  if (call.status === 'ok') return { status: 'saved', product: call.data };
  return toFailure(call, storeId, productId);
}

/** Archive: terminal, version-gated, and never a delete. */
export async function archiveProduct(input: ArchiveInput): Promise<ProductSaveState> {
  const { storeId, productId, expectedVersion } = input;
  if (!isSellerId(storeId) || !isSellerId(productId) || !isPositiveInt(expectedVersion)) {
    return { status: 'not-found' };
  }
  const call = await api.archiveProduct(storeId, productId, expectedVersion);
  if (call.status === 'ok') return { status: 'saved', product: call.data };
  return toFailure(call, storeId, productId);
}
