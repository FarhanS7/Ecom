// Branded store home (T016b identity, T024b bento home). Server component: the
// store's published products come from the public store-channel read, so the
// page renders REAL scoped products (or an honest empty/unavailable state) and
// never a fabricated tile. Catalog listings/filters arrive with T025.

import { notFound } from 'next/navigation';
import { StorefrontHome } from '@/features/storefront/home';
import { loadHomeContent, loadStoreChannel } from '@/features/storefront/load';

export const dynamic = 'force-dynamic';

export default async function StoreHomePage({ params }: { params: { slug: string } }) {
  const channel = await loadStoreChannel(params.slug);
  if (!channel) notFound();

  const content = await loadHomeContent({
    channel: 'store',
    store: { slug: channel.slug, name: channel.name },
  });

  return <StorefrontHome content={content} />;
}
