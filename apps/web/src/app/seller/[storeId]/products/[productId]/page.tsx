// Seller product editor (T027c). Server-rendered and uncached, then handed to
// one client island that owns the product + variant state for all three panels.
//
// Sequence matters for honesty: the product is read first (a scoped 404 ends
// the route), then the variants. A failed VARIANT read does not 404 — the
// product demonstrably exists — it disables that panel with a message, because
// "I could not read the variants" is not "there are no variants".

import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { loadSellerProduct, loadVariants } from '@/features/seller/load';
import { ProductWorkspace } from '@/features/seller/product-workspace';
import { ProductStatusBadge } from '@/features/seller/product-badges';

export const dynamic = 'force-dynamic';

export default async function SellerProductPage({
  params,
}: {
  params: { storeId: string; productId: string };
}) {
  const product = await loadSellerProduct(params.storeId, params.productId);
  if (product.status === 'not-found') notFound();
  if (product.status !== 'ok') {
    return (
      <Card className="ss-form-card">
        <h2 className="type-h3">
          {product.status === 'unauthenticated'
            ? 'Your session has expired'
            : 'Product temporarily unavailable'}
        </h2>
        <p className="ss-error" role="alert">
          {product.status === 'unauthenticated'
            ? 'Sign in again to keep editing this store.'
            : 'We could not reach the catalog just now. Please try again shortly.'}
        </p>
      </Card>
    );
  }

  const variants = await loadVariants(params.storeId, params.productId);
  if (variants.status === 'not-found') notFound();

  return (
    <div className="ss-console__stack">
      <div className="ss-console__heading">
        <h2 className="type-h3">{product.data.title}</h2>
        <ProductStatusBadge status={product.data.status} />
      </div>
      <ProductWorkspace
        key={product.data.id}
        storeId={params.storeId}
        product={product.data}
        variants={variants.status === 'ok' ? variants.data : []}
        variantsLoaded={variants.status === 'ok'}
      />
    </div>
  );
}
