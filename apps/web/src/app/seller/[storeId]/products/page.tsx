// Seller product list (T027c). Server-rendered and uncached: the console is
// private data, so it is fetched per request with the session cookie and shown
// only after the API answered. A scoped 404 is one answer for every cause
// (unknown store, not a member, no catalog:manage), so it becomes this route's
// 404 rather than a message that distinguishes them.

import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { loadSellerProducts } from '@/features/seller/load';
import { ProductForm } from '@/features/seller/product-form';
import { ChannelBadges, ProductStatusBadge } from '@/features/seller/product-badges';
import { formatPrice } from '@/lib/price';

export const dynamic = 'force-dynamic';

function ConsoleUnavailable({ kind }: { kind: 'signed-out' | 'outage' }) {
  return (
    <Card className="ss-form-card">
      <h2 className="type-h3">
        {kind === 'signed-out' ? 'Your session has expired' : 'Products temporarily unavailable'}
      </h2>
      <p className="ss-error" role="alert">
        {kind === 'signed-out'
          ? 'Sign in again to keep managing this store.'
          : 'We could not reach the catalog just now. Please try again shortly.'}
      </p>
    </Card>
  );
}

export default async function SellerProductsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const result = await loadSellerProducts(params.storeId);
  if (result.status === 'not-found') notFound();
  if (result.status !== 'ok') {
    return <ConsoleUnavailable kind={result.status === 'unauthenticated' ? 'signed-out' : 'outage'} />;
  }

  const products = result.data;

  return (
    <div className="ss-console__stack">
      <section aria-labelledby="seller-products-title">
        <h2 id="seller-products-title" className="type-h3">
          Products
        </h2>
        {products.length === 0 ? (
          <Card className="ss-form-card">
            <p>No products yet. Create the first one below.</p>
          </Card>
        ) : (
          <ul className="ss-console__list">
            {products.map((product) => (
              <li key={product.id}>
                <Card
                  href={`/seller/${params.storeId}/products/${product.id}`}
                  labelledBy={`seller-product-${product.id}`}
                  className="ss-console__item"
                >
                  <h3 id={`seller-product-${product.id}`} className="type-card-title">
                    {product.title}
                  </h3>
                  <p className="type-caption">
                    <code>/{product.slug}</code>
                  </p>
                  <div className="ss-badges-inline">
                    <ProductStatusBadge status={product.status} />
                    <ChannelBadges product={product} />
                  </div>
                  <p className="type-body-sm">{formatPrice(product.minPriceCents, product.currency)}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="seller-new-title">
        <h2 id="seller-new-title" className="type-h3">
          New product
        </h2>
        <ProductForm storeId={params.storeId} product={null} />
      </section>
    </div>
  );
}
