// @shopscale/web - Root layout (T007b, tokens T023a). Server component: no
// secrets here, no client configuration. Design tokens are inlined as CSS
// before first paint (no flash, no layout shift on theme swap); globals.css
// consumes them for the base layer.

import type { Metadata } from 'next';
import '@/styles/tokens.css';
import './globals.css';

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
        <header role="banner">
          <nav aria-label="Primary">
            <a href="/" aria-current="page">
              ShopScale
            </a>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer>
          <small>ShopScale demo storefront. No real payments are processed.</small>
        </footer>
      </body>
    </html>
  );
}
