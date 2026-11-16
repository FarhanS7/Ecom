// @shopscale/web app/seller/returns/page.tsx - Store returns portal landing (T059).
import { ActionButton, Card } from '@/components/ui';

export const metadata = {
  title: 'Seller Returns',
};

export default function SellerReturnsRootPage() {
  return (
    <section className="ss-console" style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
      <Card className="ss-form-card">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Store Return Inspection
        </h1>
        <p style={{ marginBottom: '1.25rem', color: '#4b5563' }}>
          Return queues are scoped per store. Please open your store console from your account dashboard to view and inspect pending return requests.
        </p>
        <ActionButton href="/account" className="ss-action-button--primary">
          Go to Account Dashboard
        </ActionButton>
      </Card>
    </section>
  );
}
