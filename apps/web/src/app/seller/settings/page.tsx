// @shopscale/web app/seller/settings/page.tsx - Seller settings root landing (REQ-STORE-003 / T068).

import { ActionButton, Card } from '@/components/ui';

export const metadata = {
  title: 'Store Settings',
};

export default function SellerSettingsRootPage() {
  return (
    <section className="ss-console" style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
      <Card className="ss-form-card">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Store Settings
        </h1>
        <p style={{ marginBottom: '1.25rem', color: '#4b5563' }}>
          Store theme, team permissions, and storefront content are managed within each specific store console. Please select your store from your account dashboard to access settings.
        </p>
        <ActionButton href="/account" className="ss-action-button--primary">
          Go to Account Dashboard
        </ActionButton>
      </Card>
    </section>
  );
}
