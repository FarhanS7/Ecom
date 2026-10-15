// @shopscale/web features/seller/product-badges - Seller-side state labels
// (T027c). No 'use client': the same presentational components render inside
// the server-rendered list AND inside the client workspace, so a status can
// never read differently in the two places.

import type { ProductResponse } from '@shopscale/contracts';
import { Tag } from '@/components/ui';

const STATUS_LABEL: Record<ProductResponse['status'], string> = {
  draft: 'Draft',
  active: 'Published',
  archived: 'Archived',
};

/** What the seller sees about a product's lifecycle, in plain words. */
export function ProductStatusBadge({ status }: { status: ProductResponse['status'] }) {
  return (
    <Tag bordered={status !== 'active'}>{STATUS_LABEL[status]}</Tag>
  );
}

/**
 * Channel visibility. A product is only really visible where the status is
 * active AND the channel is enabled, so an enabled channel on a draft is shown
 * as "on (not live)" rather than as if it were serving traffic.
 */
export function ChannelBadges({
  product,
}: {
  product: Pick<ProductResponse, 'status' | 'storeEnabled' | 'marketplaceEnabled'>;
}) {
  const live = product.status === 'active';
  const suffix = live ? '' : ' (not live)';
  return (
    <ul className="ss-badges">
      <li>
        <Tag>{`Store channel: ${product.storeEnabled ? 'on' : 'off'}${product.storeEnabled ? suffix : ''}`}</Tag>
      </li>
      <li>
        <Tag>
          {`Marketplace: ${product.marketplaceEnabled ? 'on' : 'off'}${
            product.marketplaceEnabled ? suffix : ''
          }`}
        </Tag>
      </li>
    </ul>
  );
}
