// @shopscale/web app/admin/sellers/page.tsx - Platform admin merchant moderation console (ID-5, T069).

import { redirect } from 'next/navigation';
import { Card, Frame } from '@/components/ui';
import { currentSessionEmail } from '@/lib/session-server';
import { loadAdminStores } from '@/features/admin/load';
import { MerchantModeration } from '@/features/admin/merchant-moderation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Merchant Moderation | Platform Admin',
};

export default async function AdminSellersPage() {
  const email = await currentSessionEmail();
  if (!email) {
    redirect('/login?next=/admin/sellers');
  }

  const stores = await loadAdminStores();
  if (!stores) {
    return (
      <section style={{ padding: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto' }}>
        <Card style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <h1 className="type-h3" style={{ marginBottom: 'var(--space-2)' }}>
            Access Restricted
          </h1>
          <p className="type-body" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            You do not have administrative privileges to manage merchant applications and storefronts.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section style={{ padding: 'var(--space-6) 0' }}>
      <Frame>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h1 className="type-h2" style={{ margin: '0 0 var(--space-1) 0' }}>
            Merchant Applications & Store Moderation
          </h1>
          <p className="type-caption" style={{ color: 'var(--text-secondary, #6b7280)' }}>
            Review merchant onboarding applications, approve live storefronts, or suspend non-compliant vendors.
          </p>
        </div>

        <MerchantModeration initialStores={stores} />
      </Frame>
    </section>
  );
}
