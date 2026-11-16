// apps/web/src/app/seller/[storeId]/settings/page.tsx - Store settings console (T068).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { DEFAULT_THEME } from '@/components/theme';
import {
  loadMembership,
  loadStoreContent,
  loadStoreTeam,
  loadStoreTheme,
} from '@/features/seller/load';
import { SettingsWorkspace } from '@/features/seller/settings-workspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Store Settings',
};

export default async function SellerSettingsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const membership = await loadMembership(params.storeId);
  if (membership.status === 'not-found') notFound();
  if (membership.status !== 'ok') {
    return (
      <Card className="ss-form-card" data-testid="settings-error">
        <h1 className="type-title-md">Store settings unavailable</h1>
        <p className="ss-error" role="alert">
          We could not load your store membership details. Please try again shortly.
        </p>
      </Card>
    );
  }

  // Security enforcement (T068): Only owners and managers can access store settings.
  // Catalog editors and fulfillment staff receive Access Denied.
  const isAuthorized =
    membership.data.role === 'owner' || membership.data.role === 'manager';

  if (!isAuthorized) {
    return (
      <div data-testid="settings-access-denied">
        <Card className="ss-form-card">
          <h1 className="type-title-md">Access Denied</h1>
          <p className="ss-error" role="alert">
            Store settings are restricted to store owners and managers. Your current role is{' '}
            <strong>{membership.data.role}</strong>.
          </p>
        </Card>
      </div>
    );
  }

  const [themeRes, contentRes, teamRes] = await Promise.all([
    loadStoreTheme(params.storeId),
    loadStoreContent(params.storeId),
    loadStoreTeam(params.storeId),
  ]);

  const theme = themeRes.status === 'ok' ? themeRes.data : DEFAULT_THEME;
  const content = contentRes.status === 'ok' ? contentRes.data : undefined;
  const team = teamRes.status === 'ok' ? teamRes.data : { storeId: params.storeId, members: [], invitations: [] };

  return (
    <div className="ss-seller-settings-page">
      <header className="mb-6">
        <h1 className="type-title-lg">Store Settings</h1>
        <p className="type-caption text-muted">
          Manage brand theme tokens, storefront presentation, and staff permissions.
        </p>
      </header>

      <SettingsWorkspace
        storeId={params.storeId}
        initialTheme={theme}
        initialContent={content}
        initialMembers={team.members}
        initialInvitations={team.invitations}
      />
    </div>
  );
}
