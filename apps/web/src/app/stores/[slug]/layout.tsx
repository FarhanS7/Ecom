// Branded storefront layout (T016b, theme injection via tokens T023b, channel
// loading T024b). The channel ALWAYS derives from the path on the server; the
// validated theme is mapped to the allowlisted --store-* variables by
// TenantScope on a [data-tenant] wrapper, so components read design tokens and
// swap theme with zero code change. Unknown/suspended slugs and invalid themes
// 404. The fetch is shared with the page via React cache().
//
// Per-tenant chrome (logo/wordmark in the header) needs the route's
// ChannelContext and is still deferred; the hero owns the store's h1.

import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { TenantScope } from '@/components/ui';
import { loadStoreChannel } from '@/features/storefront/load';

export const dynamic = 'force-dynamic';

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const channel = await loadStoreChannel(params.slug);
  if (!channel) notFound();

  return (
    <TenantScope theme={channel.theme} testId="store-theme" dataStore={channel.slug}>
      <p>
        <a href="/">← Marketplace</a>
      </p>
      {children}
    </TenantScope>
  );
}
