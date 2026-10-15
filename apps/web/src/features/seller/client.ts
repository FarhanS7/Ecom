// @shopscale/web features/seller/client - Server-only seller writes (T027b).
// SERVER ONLY, and only ever called from a server action: the browser has no
// allowlisted route to these endpoints (ADR-0010 decision 5), so every write
// is validated and scope-checked on the way in.
//
// The API's optimistic concurrency is preserved verbatim: every call carries
// `expectedVersion`, and a 409 stays a `conflict` (with the API's constant
// message) instead of being flattened into a generic failure — the console
// offers "reload latest" / "apply my changes" for it.
//
// Note the asymmetry the UI must respect: a VARIANT write is version-gated by
// the PRODUCT's counter and bumps that counter, but the response describes the
// variant. Callers that need a current version re-read the product (the
// actions do).

import {
  productResponse,
  variantResponse,
} from '@shopscale/contracts';
import type {
  ProductCreateRequest,
  ProductResponse,
  ProductUpdateRequest,
  PublicationToggleRequest,
  VariantCreateRequest,
  VariantResponse,
  VariantUpdateRequest,
} from '@shopscale/contracts';
import {
  sellerArchivePath,
  sellerFetch,
  sellerProductPath,
  sellerProductsPath,
  sellerPublicationPath,
  sellerVariantPath,
  sellerVariantsPath,
  type SellerCall,
} from '@/features/seller/load';

export async function createProduct(
  storeId: string,
  input: ProductCreateRequest,
): Promise<SellerCall<ProductResponse>> {
  return sellerFetch(sellerProductsPath(storeId), { method: 'POST', body: input }, productResponse);
}

export async function updateProduct(
  storeId: string,
  productId: string,
  input: ProductUpdateRequest,
): Promise<SellerCall<ProductResponse>> {
  return sellerFetch(
    sellerProductPath(storeId, productId),
    { method: 'PATCH', body: input },
    productResponse,
  );
}

/**
 * Publication flags are independent and are NOT version-guarded (T020b): the
 * route has no `expectedVersion`, so this is last-write-wins by design. The
 * response still carries the bumped product version, which callers adopt.
 */
export async function setPublication(
  storeId: string,
  productId: string,
  input: PublicationToggleRequest,
): Promise<SellerCall<ProductResponse>> {
  return sellerFetch(
    sellerPublicationPath(storeId, productId),
    { method: 'PATCH', body: input },
    productResponse,
  );
}

/** Archive is terminal and version-gated; it never deletes rows. */
export async function archiveProduct(
  storeId: string,
  productId: string,
  expectedVersion: number,
): Promise<SellerCall<ProductResponse>> {
  return sellerFetch(
    sellerArchivePath(storeId, productId),
    { method: 'POST', body: { expectedVersion } },
    productResponse,
  );
}

export async function createVariant(
  storeId: string,
  productId: string,
  input: VariantCreateRequest,
): Promise<SellerCall<VariantResponse>> {
  return sellerFetch(
    sellerVariantsPath(storeId, productId),
    { method: 'POST', body: input },
    variantResponse,
  );
}

/** Version-gated by the PRODUCT's counter (see the module note above). */
export async function updateVariant(
  storeId: string,
  productId: string,
  variantId: string,
  input: VariantUpdateRequest,
): Promise<SellerCall<VariantResponse>> {
  return sellerFetch(
    sellerVariantPath(storeId, productId, variantId),
    { method: 'PATCH', body: input },
    variantResponse,
  );
}
