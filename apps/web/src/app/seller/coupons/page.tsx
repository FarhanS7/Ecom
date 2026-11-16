// @shopscale/web app/seller/coupons/page.tsx - Store promotional coupons portal landing (OR-9 / T063).

import { ActionButton, Card } from '@/components/ui';

export const metadata = {
  title: 'Seller Coupons & Promotions',
};

export default function SellerCouponsRootPage() {
  return (
    <section className="ss-console" style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
      <Card className="ss-form-card">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Store Coupons & Promotions
        </h1>
        <p style={{ marginBottom: '1.25rem', color: '#4b5563' }}>
          Promotions and coupon codes are scoped per store. Please navigate to your store console from your account dashboard to create and manage store promotional discounts.
        </p>
        <ActionButton href="/account" className="ss-action-button--primary">
          Go to Account Dashboard
        </ActionButton>
      </Card>
    </section>
  );
}
