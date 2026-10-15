// @shopscale/web - Root layout (T007b, tokens T023a, primitives T023b).
// Server component: no secrets here, no client configuration. Design tokens
// are inlined as CSS before first paint (no flash, no layout shift on theme
// swap); the Frame/Header/Footer primitives consume them.

import type { Metadata } from 'next';
import '@/styles/tokens.css';
import '@/styles/components.css';
import './globals.css';
import { Header } from '@/components/header';
import { Footer, Frame } from '@/components/ui';

export const metadata: Metadata = {
  title: {
    default: 'ShopScale Marketplace',
    template: '%s · ShopScale',
  },
  description: 'Independent stores and a shared marketplace. Portfolio demo — no real payments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="sr-only" href="#main">
          Skip to content
        </a>
        <Frame>
          <Header tenantName="ShopScale" />
          <main id="main">{children}</main>
          <Footer label="ShopScale" />
        </Frame>
      </body>
    </html>
  );
}
