import Link from 'next/link';
import { SessionPanel } from '@/features/auth/session-panel';
import { AddressesSection } from '@/features/account/addresses';
import { currentSessionEmail } from '@/lib/session-server';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const email = await currentSessionEmail();
  return (
    <section aria-labelledby="account-title">
      <h1 id="account-title">Your account</h1>
      <SessionPanel initialEmail={email} />
      <Card className="ss-form-card" style={{ marginBottom: 'var(--space-6)' }}>
        <h2>Order History & Tracking</h2>
        <p>Review past purchases, download invoices, and track delivery progress.</p>
        <Link href="/account/orders" className="ss-btn ss-btn--secondary" data-testid="orders-link">
          View Your Orders &rarr;
        </Link>
      </Card>
      <Card className="ss-form-card" style={{ marginBottom: 'var(--space-6)' }}>
        <h2>Saved Wishlist</h2>
        <p>Review items you saved for later and add them directly to your cart.</p>
        <Link href="/account/wishlist" className="ss-btn ss-btn--secondary" data-testid="wishlist-link">
          View Your Wishlist &rarr;
        </Link>
      </Card>
      <AddressesSection />
    </section>
  );
}
