// Branded storefront layout (T016b, theme injection via tokens T023b). The
// channel ALWAYS derives from the path on the server; the validated theme is
// mapped to the allowlisted --store-* variables by tenantThemeStyle (T023a) on
// a [data-tenant] wrapper, so components read design tokens and swap theme
// with zero code change. Unknown/suspended slugs and invalid themes 404.
//
// Per-tenant chrome (logo/wordmark in the header) needs the route's
// ChannelContext and lands with T024; here the shell header stays the
// marketplace's and only the storefront CONTENT is theme-scoped.

import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { apiBaseUrl } from '@/lib/api';
import type { ThemeTokens } from '@shopscale/contracts';
import { TenantScope } from '@/components/ui';
import { isValidTheme } from '@/components/theme';

export const dynamic = 'force-dynamic';

const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;

interface ChannelBody {
  channel?: string;
  slug?: string;
  name?: string;
  theme?: ThemeTokens;
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const { slug } = params;
  if (!SLUG_PATTERN.test(slug)) notFound();

  let channel: ChannelBody | null = null;
  try {
    const res = await fetch(`${apiBaseUrl()}/v1/stores/${slug}`, { cache: 'no-store' });
    if (res.ok) channel = (await res.json()) as ChannelBody;
  } catch {
    channel = null;
  }
  if (!channel || channel.channel !== 'store' || !channel.theme || !isValidTheme(channel.theme)) {
    notFound();
  }

  return (
    <TenantScope theme={channel.theme} testId="store-theme" dataStore={channel.slug}>
      <p>
        <a href="/">← Marketplace</a>
      </p>
      <h1 className="type-display" style={{ color: 'var(--text-primary)' }}>
        {channel.name}
      </h1>
      {children}
    </TenantScope>
  );
}
