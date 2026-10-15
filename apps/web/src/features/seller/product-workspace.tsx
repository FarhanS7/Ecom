'use client';

// @shopscale/web features/seller/product-workspace - The editor island (T027c).
//
// The three panels share ONE product state on purpose: a variant write bumps
// the product's version (T020b), and if the panels each kept their own copy the
// next save would fail with a conflict the seller did not cause. Every mutation
// returns the affected entity, so this state is authoritative until the page is
// reloaded — no router.refresh() round-trip, and nothing shows a value the
// server has not already confirmed.
//
// The page gives this component `key={product.id}`, so moving between products
// remounts it instead of reusing stale state.

import { useState } from 'react';
import type { ProductResponse, VariantResponse } from '@shopscale/contracts';
import { ProductForm } from '@/features/seller/product-form';
import { VariantTable } from '@/features/seller/variant-table';
import { PublicationControls } from '@/features/seller/publication-controls';

export interface ProductWorkspaceProps {
  storeId: string;
  product: ProductResponse;
  variants: VariantResponse[];
  /** `false` when the variant list could not be loaded (an outage, not "none"). */
  variantsLoaded: boolean;
}

export function ProductWorkspace({
  storeId,
  product: initialProduct,
  variants: initialVariants,
  variantsLoaded,
}: ProductWorkspaceProps) {
  const [product, setProduct] = useState(initialProduct);
  const [variants, setVariants] = useState(initialVariants);

  return (
    <div className="ss-console__stack">
      <ProductForm storeId={storeId} product={product} onSaved={setProduct} />
      <VariantTable
        storeId={storeId}
        product={product}
        variants={variants}
        loaded={variantsLoaded}
        onVariants={setVariants}
        onProduct={setProduct}
      />
      <PublicationControls storeId={storeId} product={product} onProduct={setProduct} />
    </div>
  );
}
