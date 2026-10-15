// Marketplace product detail (T026b). Server-rendered: the title, price and
// description arrive in the HTML (T026's "validate server-rendered content"),
// and the only client island is the variant picker's selection state.
//
// The route param is the product SLUG (the API's `:productSlug`), not an id.
// Three outcomes: a definite not-found is a 404, an outage renders the honest
// "temporarily unavailable" card, and a valid product renders the PDP.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogUnavailable, ProductDetail } from '@/features/catalog/product-detail';
import { loadProductDetail } from '@/features/catalog/load';
import { productPagePath } from '@/features/catalog/query-state';
import { resolveVariantId } from '@/features/catalog/variants';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
};

function requestedVariant(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const result = await loadProductDetail(null, params.slug);
  if (result.status !== 'ok') return { title: 'Product' };
  return {
    title: result.product.title,
    description: result.product.description.slice(0, 160),
  };
}

export default async function MarketplaceProductPage({ params, searchParams }: PageProps) {
  const result = await loadProductDetail(null, params.slug);

  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return <CatalogUnavailable listPath={productPagePath(null)} />;
  }

  return (
    <ProductDetail
      product={result.product}
      storeSlug={null}
      initialVariantId={resolveVariantId(
        result.product.variants,
        requestedVariant(searchParams['variant']),
      )}
    />
  );
}
