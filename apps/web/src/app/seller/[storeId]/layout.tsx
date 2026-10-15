// Seller store console shell (T027c). The gate lives here, not in the UI:
// `loadMembership` asks the API, which answers ONE generic 404 for an unknown
// store, a non-member AND a member without catalog:manage (the T018 no-oracle
// rule) — so this layout cannot tell those apart, and must not pretend to: all
// three become a 404 for the whole /seller/{storeId} subtree.
//
// Route guards improve UX; NestJS remains the authorization boundary. Every
// page below re-reads its data with the same cookie and would answer the same
// way even if this gate were removed.

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ActionButton, Card } from '@/components/ui';
import { loadMembership } from '@/features/seller/load';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Store console',
};

function ConsoleShell({
  storeId,
  role,
  children,
}: {
  storeId: string;
  role: string;
  children: ReactNode;
}) {
  return (
    <section className="ss-console" aria-labelledby="seller-title">
      <header className="ss-console__header">
        <h1 id="seller-title">Store console</h1>
        <p className="type-caption">
          Signed in as <strong>{role}</strong> for store <code>{storeId}</code>
        </p>
      </header>
      <nav className="ss-console__nav" aria-label="Store console">
        <a href={`/seller/${storeId}/products`}>Products</a>
      </nav>
      {children}
    </section>
  );
}

export default async function SellerStoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { storeId: string };
}) {
  const membership = await loadMembership(params.storeId);

  if (membership.status === 'not-found') notFound();

  if (membership.status === 'unauthenticated') {
    return (
      <section className="ss-console" aria-labelledby="seller-signin-title">
        <Card className="ss-form-card">
          <h1 id="seller-signin-title">Sign in to manage your store</h1>
          <p>
            The store console is for store staff. Sign in with the account that owns or helps run
            this store.
          </p>
          <ActionButton href="/login">Go to sign in</ActionButton>
        </Card>
      </section>
    );
  }

  if (membership.status === 'unavailable') {
    return (
      <section className="ss-console" aria-labelledby="seller-outage-title">
        <Card className="ss-form-card">
          <h1 id="seller-outage-title">Store console temporarily unavailable</h1>
          <p className="ss-error" role="alert">
            We could not reach the store service just now. Please try again shortly.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <ConsoleShell storeId={params.storeId} role={membership.data.role}>
      {children}
    </ConsoleShell>
  );
}
