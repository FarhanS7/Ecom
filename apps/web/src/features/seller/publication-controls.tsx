'use client';

// @shopscale/web features/seller/publication-controls - Lifecycle and channels
// (T027c). Two independent axes, deliberately kept apart:
//
//   status            draft | active | archived  (the product's own lifecycle)
//   channel flags     store / marketplace        (where it is listed)
//
// A product is visible on a channel only when its status is active AND that
// channel is enabled, which is why the helper text spells out both. Nothing is
// optimistic: each control reports what the server returned, and a refusal
// (publishing without a variant, a stale version) is shown with its reason.

import { useState } from 'react';
import type { ProductResponse } from '@shopscale/contracts';
import { ActionButton, Card, SecondaryButton } from '@/components/ui';
import {
  archiveProduct,
  savePublication,
  setProductStatus,
} from '@/features/seller/actions';
import type { ProductSaveState } from '@/features/seller/state';
import { ActionNotice, ConflictNotice } from '@/features/seller/notices';
import { ChannelBadges, ProductStatusBadge } from '@/features/seller/product-badges';

export interface PublicationControlsProps {
  storeId: string;
  product: ProductResponse;
  /** Adopts the returned product so every panel shares one current version. */
  onProduct: (product: ProductResponse) => void;
}

type Kind = 'status' | 'store' | 'marketplace' | 'archive';

type Notice = { tone: 'ok' | 'error'; text: string } | null;

interface Conflict {
  kind: Kind;
  message: string;
  /**
   * Rebuilds the same request against whatever version is current at retry
   * time. Storing the bound request instead would capture the stale version
   * and fail the retry with the very conflict it is recovering from.
   */
  build: (version: number) => Promise<ProductSaveState>;
}

const REASON_ID = 'publication-archived-reason';

function helperText(status: ProductResponse['status']): string {
  switch (status) {
    case 'draft':
      return 'This product is a draft: shoppers cannot see it yet. Publish it, then enable the channels where it should appear.';
    case 'active':
      return 'This product is published. It is visible on the channels enabled below.';
    default:
      return 'This product is archived. Archived products cannot be published again and stay out of both channels.';
  }
}

export function PublicationControls({ storeId, product, onProduct }: PublicationControlsProps) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [archiveArmed, setArchiveArmed] = useState(false);

  const archived = product.status === 'archived';

  async function run(
    kind: Kind,
    build: (version: number) => Promise<ProductSaveState>,
    success: string,
  ) {
    setBusy(kind);
    setNotice(null);
    setConflict(null);
    setArchiveArmed(false);
    const state = await build(product.version);
    setBusy(null);

    if (state.status === 'saved') {
      onProduct(state.product);
      setNotice({ tone: 'ok', text: success });
      return;
    }
    if (state.status === 'conflict') {
      // Adopt the server's version, then let the seller re-apply the same
      // action on top of it — the button IS the entered value here.
      if (state.current) onProduct(state.current);
      setConflict({ kind, message: state.message, build });
      return;
    }
    if (state.status === 'invalid') {
      setNotice({ tone: 'error', text: 'Check the highlighted fields.' });
      return;
    }
    if (state.status === 'not-found') {
      setNotice({ tone: 'error', text: 'This product is not available to your account.' });
      return;
    }
    if (state.status === 'unauthenticated') {
      setNotice({ tone: 'error', text: 'Your session has expired. Sign in again to continue.' });
      return;
    }
    setNotice({
      tone: 'error',
      text: 'We could not reach the catalog just now. Please try again shortly.',
    });
  }

  const disabledReason = archived ? REASON_ID : undefined;

  return (
    <Card className="ss-form-card">
      <section aria-labelledby="publication-title" className="ss-stack">
        <h3 id="publication-title" className="type-h3">
          Publication
        </h3>
        <p className="type-caption" id="publication-help">
          {helperText(product.status)}
        </p>
        <div className="ss-badges-inline">
          <ProductStatusBadge status={product.status} />
          <ChannelBadges product={product} />
        </div>

        {archived ? (
          <p className="type-caption" id={REASON_ID}>
            Archived products cannot be published or listed on a channel.
          </p>
        ) : null}

        <div className="ss-form__actions">
          {product.status === 'draft' ? (
            <ActionButton
              loading={busy === 'status'}
              disabled={archived}
              describedBy={disabledReason}
              onClick={() =>
                void run(
                  'status',
                  (version) =>
                    setProductStatus({
                      storeId,
                      productId: product.id,
                      expectedVersion: version,
                      status: 'active',
                    }),
                  'Product published.',
                )
              }
            >
              Publish
            </ActionButton>
          ) : (
            <SecondaryButton
              loading={busy === 'status'}
              disabled={archived}
              describedBy={disabledReason}
              onClick={() =>
                void run(
                  'status',
                  (version) =>
                    setProductStatus({
                      storeId,
                      productId: product.id,
                      expectedVersion: version,
                      status: 'draft',
                    }),
                  'Product moved back to draft.',
                )
              }
            >
              Unpublish
            </SecondaryButton>
          )}

          <SecondaryButton
            loading={busy === 'store'}
            disabled={archived}
            describedBy={disabledReason}
            onClick={() =>
              void run(
                'store',
                () =>
                  savePublication({
                    storeId,
                    productId: product.id,
                    storeEnabled: !product.storeEnabled,
                  }),
                product.storeEnabled
                  ? 'Unlisted from the store channel.'
                  : 'Listed on the store channel.',
              )
            }
          >
            {product.storeEnabled ? 'Unlist from store' : 'List on store'}
          </SecondaryButton>

          <SecondaryButton
            loading={busy === 'marketplace'}
            disabled={archived}
            describedBy={disabledReason}
            onClick={() =>
              void run(
                'marketplace',
                () =>
                  savePublication({
                    storeId,
                    productId: product.id,
                    marketplaceEnabled: !product.marketplaceEnabled,
                  }),
                product.marketplaceEnabled
                  ? 'Unlisted from the marketplace.'
                  : 'Listed on the marketplace.',
              )
            }
          >
            {product.marketplaceEnabled ? 'Unlist from marketplace' : 'List on marketplace'}
          </SecondaryButton>

          {archived ? null : archiveArmed ? (
            <>
              <ActionButton
                loading={busy === 'archive'}
                onClick={() =>
                  void run(
                    'archive',
                    (version) =>
                      archiveProduct({
                        storeId,
                        productId: product.id,
                        expectedVersion: version,
                      }),
                    'Product archived.',
                  )
                }
              >
                Confirm archive
              </ActionButton>
              <SecondaryButton onClick={() => setArchiveArmed(false)}>Keep product</SecondaryButton>
            </>
          ) : (
            <SecondaryButton onClick={() => setArchiveArmed(true)} aria-describedby="archive-note">
              Archive
            </SecondaryButton>
          )}
        </div>

        <p className="type-caption" id="archive-note">
          Archiving is permanent, and the product stops appearing on both channels.
        </p>

        {notice ? <ActionNotice tone={notice.tone}>{notice.text}</ActionNotice> : null}

        {conflict ? (
          <ConflictNotice
            message={conflict.message}
            onApply={() => void run(conflict.kind, conflict.build, 'Applied on the latest version.')}
          />
        ) : null}
      </section>
    </Card>
  );
}
