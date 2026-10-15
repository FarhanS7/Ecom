// @shopscale/web features/catalog/variants - Pure variant rules (T026b).
// Kept pure and free of React/Next so the server route, the client island, and
// the tests all apply the SAME rules (label shape, selection fallback,
// purchasability) — three copies of "which variant is selected" is exactly how
// a store page ends up showing another channel's price.

import type { ChannelProductDetailDto } from '@shopscale/contracts';

export type ChannelVariant = ChannelProductDetailDto['variants'][number];

export interface VariantView {
  id: string;
  sku: string;
  priceCents: number;
  label: string;
}

/**
 * Attribute keys that read naturally first ("Black / M" rather than
 * "M / Black"). Anything else is appended alphabetically so the label is
 * deterministic — the server and the client must produce identical text.
 */
const PREFERRED_ATTRIBUTE_KEYS = [
  'color',
  'colour',
  'size',
  'storage',
  'capacity',
  'material',
  'style',
  'finish',
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Human label from a variant's attributes, falling back to its SKU. */
export function variantLabel(variant: { sku: string; attributes: Record<string, unknown> }): string {
  const present = Object.keys(variant.attributes);
  const preferred = PREFERRED_ATTRIBUTE_KEYS.filter((key) => present.includes(key));
  const rest = present.filter((key) => !PREFERRED_ATTRIBUTE_KEYS.includes(key)).sort();

  const parts: string[] = [];
  for (const key of [...preferred, ...rest]) {
    const value = variant.attributes[key];
    if (typeof value === 'string' && value.trim() !== '') parts.push(value.trim());
    else if (typeof value === 'number' || typeof value === 'boolean') parts.push(String(value));
  }
  return parts.length > 0 ? parts.join(' / ') : variant.sku;
}

export function toVariantView(variant: ChannelVariant): VariantView {
  return {
    id: variant.id,
    sku: variant.sku,
    priceCents: variant.priceCents,
    label: variantLabel(variant),
  };
}

/**
 * Resolve a requested variant against THIS product only. A missing, malformed,
 * or foreign id falls back to the first variant: a stale bookmark or a
 * hand-edited URL must never render a price that belongs to another product.
 */
export function resolveVariantId(
  variants: Array<{ id: string }>,
  requested: string | null | undefined,
): string | null {
  const first = variants[0]?.id ?? null;
  if (variants.length === 0) return null;
  const wanted = typeof requested === 'string' ? requested.trim() : '';
  if (UUID_PATTERN.test(wanted) && variants.some((variant) => variant.id === wanted)) {
    return wanted;
  }
  return first;
}

export interface PurchaseState {
  available: boolean;
  reason: string | null;
}

/**
 * Inventory arrives with T032 and the cart with T033, so nothing is purchasable
 * yet. Both reasons are honest and distinct: a product with no active variant
 * is not a checkout problem. When the cart lands, only CHECKOUT_CONNECTED flips.
 */
const CHECKOUT_CONNECTED = false;

export function purchaseState(product: { variants: Array<unknown> }): PurchaseState {
  if (product.variants.length === 0) {
    return {
      available: false,
      reason: 'This product has no active variant available to order yet.',
    };
  }
  if (!CHECKOUT_CONNECTED) {
    return { available: false, reason: 'Checkout is not connected yet.' };
  }
  return { available: true, reason: null };
}
