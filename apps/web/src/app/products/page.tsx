// Marketplace product listing (T025b). The shell (frame, header, filters) is
// server-rendered and deep-linkable; the results are a client island that reads
// the SAME URL, so Back/Forward and shared links restore the exact view.
// The public catalog read is proxied through our own gateway — the browser
// never talks to the API origin directly.

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Card } from '@/components/ui';
import { FilterPanel } from '@/features/catalog/filter-panel';
import { ProductList } from '@/features/catalog/product-list';
import { productPagePath } from '@/features/catalog/query-state';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Browse products published to the ShopScale marketplace.',
};

export default function ProductsPage() {
  const basePath = productPagePath(null);
  return (
    <section aria-labelledby="plp-heading">
      <h1 id="plp-heading" className="type-display ss-plp-title">
        All products
      </h1>
      <Suspense
        fallback={
          <Card as="section" labelledBy="plp-fallback">
            <h2 id="plp-fallback" className="type-card-title">
              Loading catalog
            </h2>
          </Card>
        }
      >
        <div className="ss-plp">
          <FilterPanel basePath={basePath} />
          <ProductList />
        </div>
      </Suspense>
    </section>
  );
}
