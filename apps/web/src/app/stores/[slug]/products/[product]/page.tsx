// Store product detail (T026b). The channel comes from the PATH: the layout
// already resolved (and 404'd) the store, and the detail read is scoped to that
// store slug, so a marketplace product cannot be rendered here (the loader also
// asserts that the returned product's store matches the route).
//
// Like the marketplace route: definite not-found → 404, outage → an honest
// "temporarily unavailable" card, otherwise the PDP, all server-rendered.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogUnavailable, ProductDetail } from '@/features/catalog/product-detail';
import { loadProductDetail } from '@/features/catalog/load';
import { productPagePath } from '@/features/catalog/query-state';
import { loadStoreChannel } from '@/features/storefront/load';
import { resolveVariantId } from '@/features/catalog/variants';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: { slug: string; product: string };
  searchParams: Record<string, string | string[] | undefined>;
};

function requestedVariant(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const channel = await loadStoreChannel(params.slug);
  if (!channel) return { title: 'Product' };
  const result = await loadProductDetail(channel.slug, params.product);
  if (result.status !== 'ok') return { title: channel.name };
  return {
    title: `${result.product.title} — ${channel.name}`,
    description: result.product.description.slice(0, 160),
  };
}

export default async function StoreProductPage({ params, searchParams }: PageProps) {
  const channel = await loadStoreChannel(params.slug);
  if (!channel) notFound();

  const listPath = productPagePath(channel.slug);
  const result = await loadProductDetail(channel.slug, params.product);

  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') return <CatalogUnavailable listPath={listPath} />;

  return (
    <ProductDetail
      product={result.product}
      storeSlug={channel.slug}
      initialVariantId={resolveVariantId(
        result.product.variants,
        requestedVariant(searchParams['variant']),
      )}
    />
  );
}
