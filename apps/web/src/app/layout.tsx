// @shopscale/web - Root layout
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShopScale',
  description: 'Multi-vendor e-commerce marketplace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}