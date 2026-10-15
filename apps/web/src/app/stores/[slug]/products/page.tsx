// Branded store product listing (T025b). The channel comes from the PATH on
// the server (the layout already resolved and 404'd unknown stores); the island
// is passed the resolved slug so every gateway request stays store-scoped and
// the theme from the layout's [data-tenant] wrapper applies to the grid.

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { FilterPanel } from '@/features/catalog/filter-panel';
import { ProductList } from '@/features/catalog/product-list';
import { productPagePath } from '@/features/catalog/query-state';
import { loadStoreChannel } from '@/features/storefront/load';

export const dynamic = 'force-dynamic';

export default async function StoreProductsPage({ params }: { params: { slug: string } }) {
  const channel = await loadStoreChannel(params.slug);
  if (!channel) notFound();

  const basePath = productPagePath(channel.slug);

  return (
    <section aria-labelledby="plp-heading">
      <h1 id="plp-heading" className="type-display ss-plp-title">
        {channel.name} products
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
          <ProductList storeSlug={channel.slug} />
        </div>
      </Suspense>
    </section>
  );
}
