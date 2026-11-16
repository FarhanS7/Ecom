// @shopscale/web app/seller/dashboard/page.tsx - Seller dashboard root landing (AD-2, REQ-ENG-002 / T067).

import { ActionButton, Card } from '@/components/ui';

export const metadata = {
  title: 'Seller Analytics Dashboard',
};

export default function SellerDashboardRootPage() {
  return (
    <section className="ss-console" style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
      <Card className="ss-form-card">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Seller Analytics Dashboard
        </h1>
        <p style={{ marginBottom: '1.25rem', color: '#4b5563' }}>
          Store analytics and sales metrics are scoped per merchant store. Please navigate to your store console from your account dashboard to view sales, GMV, and order trends.
        </p>
        <ActionButton href="/account" className="ss-action-button--primary">
          Go to Account Dashboard
        </ActionButton>
      </Card>
    </section>
  );
}
