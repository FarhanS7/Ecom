'use client';

// apps/web/src/features/seller/general-settings.tsx - Storefront general content and banner settings (T068).

import React, { useState } from 'react';
import type { StoreContentDto, UpdateStoreContentDto } from '@shopscale/contracts';
import { ActionButton, Card } from '@/components/ui';

export interface GeneralSettingsProps {
  storeId: string;
  initialContent?: StoreContentDto | undefined;
  onSave?: ((content: UpdateStoreContentDto) => Promise<boolean | void>) | undefined;
}

export function GeneralSettings({
  storeId,
  initialContent,
  onSave,
}: GeneralSettingsProps) {
  const [headline, setHeadline] = useState(initialContent?.headline ?? '');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const payload: UpdateStoreContentDto = {
      headline: headline.trim() || null,
    };

    try {
      if (onSave) {
        await onSave(payload);
        setStatusMessage('Store content updated successfully!');
      } else {
        const res = await fetch(`/api/v1/seller/stores/${storeId}/content`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? 'Failed to update store content.');
        }
        setStatusMessage('Store content updated successfully!');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update store content');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ss-general-settings" data-testid="general-settings">
      <Card className="ss-form-card">
        <h2 className="type-title-md">Storefront Presentation</h2>
        <p className="type-caption text-muted">
          Configure headline banners and homepage featured content shown on your branded storefront.
        </p>

        {statusMessage && (
          <div className="ss-banner ss-banner--success" role="status">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="ss-banner ss-banner--error" role="alert">
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="ss-settings-form"
          aria-label="General store settings"
        >
          <div className="ss-form-group">
            <label htmlFor="store-headline" className="ss-label">
              Homepage Hero Headline
            </label>
            <input
              type="text"
              id="store-headline"
              value={headline}
              maxLength={255}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Engineered For High Performance Athletics"
              className="ss-input"
            />
            <span className="type-caption text-muted">
              Displayed prominently on your brand storefront homepage hero section.
            </span>
          </div>

          <div className="ss-form-actions">
            <ActionButton type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </ActionButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
