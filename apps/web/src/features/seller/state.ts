// @shopscale/web features/seller/state - Server-action state shapes (T027b).
// A plain module (NOT the 'use server' file) so the client components can
// import the types without importing a server boundary.
//
// The shapes are deliberately explicit about the two failures a seller can act
// on: `invalid` (field errors, entered values kept) and `conflict` (retryable
// with a fresh version). Everything else is a single honest "not yours",
// "signed out" or "unavailable" answer.

import type { ProductResponse, VariantResponse } from '@shopscale/contracts';
import type { FieldErrors, ProductFormValues, VariantFormValues } from '@/features/seller/validation';

export type SellerFailure =
  | { status: 'invalid'; errors: FieldErrors }
  | { status: 'conflict'; message: string; current: ProductResponse | null }
  | { status: 'not-found' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export type ProductSaveState = SellerFailure | { status: 'saved'; product: ProductResponse };

export type VariantSaveState =
  | SellerFailure
  | {
      status: 'saved';
      variant: VariantResponse;
      /**
       * The re-read product, whose version the variant write bumped. `null`
       * means the write SUCCEEDED but the refresh failed: the caller must tell
       * the user to reload before the next version-carrying edit, and must not
       * pretend the write failed.
       */
      product: ProductResponse | null;
    };

export interface ProductSaveInput {
  storeId: string;
  /** `null` creates a new product; otherwise the product being edited. */
  productId: string | null;
  /** Required when editing (optimistic concurrency). */
  expectedVersion: number | null;
  values: ProductFormValues;
}

export interface VariantSaveInput {
  storeId: string;
  productId: string;
  /** `null` creates a variant; otherwise the variant being edited. */
  variantId: string | null;
  /** The PRODUCT's counter — it gates variant writes (T020b). */
  expectedVersion: number;
  values: VariantFormValues;
}

export interface PublicationInput {
  storeId: string;
  productId: string;
  marketplaceEnabled?: boolean | undefined;
  storeEnabled?: boolean | undefined;
}

export interface StatusInput {
  storeId: string;
  productId: string;
  expectedVersion: number;
  /** `active` publishes; `draft` unpublishes (archive is a separate action). */
  status: 'draft' | 'active';
}

export interface ArchiveInput {
  storeId: string;
  productId: string;
  expectedVersion: number;
}
