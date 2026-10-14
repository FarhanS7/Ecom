import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { apiBaseUrl } from '@/lib/api';
import type { ThemeTokens } from '@shopscale/contracts';

export const dynamic = 'force-dynamic';

const SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;

interface ChannelBody {
  channel?: string;
  slug?: string;
  name?: string;
  theme?: ThemeTokens;
}

function themeVars(theme: ThemeTokens): CSSProperties {
  return {
    '--store-primary': theme.primary,
    '--store-background': theme.background,
    '--store-surface': theme.surface,
    '--store-text': theme.text,
    '--store-muted': theme.muted,
    '--store-accent': theme.accent,
    '--store-radius': `${theme.radius}px`,
  } as CSSProperties;
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
  if (!channel || channel.channel !== 'store' || !channel.theme) notFound();

  return (
    <div style={themeVars(channel.theme)} data-testid="store-theme" data-store={channel.slug}>
      <p>
        <a href="/">← Marketplace</a>
      </p>
      <h1 style={{ color: 'var(--store-primary)' }}>{channel.name}</h1>
      {children}
    </div>
  );
}
