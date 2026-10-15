// T026b: variant rules — labels, selection fallback, and the purchase gate.
// These are pure so the server route and the client island cannot drift.

import { describe, expect, it } from 'vitest';
import {
  purchaseState,
  resolveVariantId,
  toVariantView,
  variantLabel,
} from '@/features/catalog/variants';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('variant labels (T026b)', () => {
  it('reads attributes in a natural order and falls back to the SKU', () => {
    expect(variantLabel({ sku: 'X-BLK-M', attributes: { size: 'M', color: 'Black' } })).toBe(
      'Black / M',
    );
    expect(variantLabel({ sku: 'X-BLK-M', attributes: { color: 3, size: true } })).toBe('3 / true');
    // Unrecognised keys are deterministic (alphabetical) and come last.
    expect(variantLabel({ sku: 'X', attributes: { zeta: 'z', alpha: 'a', color: 'Black' } })).toBe(
      'Black / a / z',
    );
    expect(variantLabel({ sku: 'X-BLK-M', attributes: {} })).toBe('X-BLK-M');
    expect(variantLabel({ sku: 'X-BLK-M', attributes: { color: '   ' } })).toBe('X-BLK-M');
  });

  it('projects a contract variant into the view shape', () => {
    expect(
      toVariantView({
        id: A,
        sku: 'X-BLK',
        priceCents: 12900,
        attributes: { color: 'Black' },
      }),
    ).toEqual({ id: A, sku: 'X-BLK', priceCents: 12900, label: 'Black' });
  });
});

describe('variant selection is scoped to one product (T026b)', () => {
  const variants = [{ id: A }, { id: B }];

  it('accepts an id that belongs to the product', () => {
    expect(resolveVariantId(variants, B)).toBe(B);
    expect(resolveVariantId(variants, `${B} `)).toBe(B);
  });

  it('falls back to the first variant for anything else', () => {
    const foreign = '33333333-3333-4333-8333-333333333333';
    for (const requested of [foreign, 'not-a-uuid', '', '   ', null, undefined, '../etc']) {
      expect(resolveVariantId(variants, requested)).toBe(A);
    }
  });

  it('has nothing to select without variants', () => {
    expect(resolveVariantId([], A)).toBeNull();
  });
});

describe('the purchase gate (T026b)', () => {
  it('explains a product with no variant separately from a missing checkout', () => {
    const none = purchaseState({ variants: [] });
    expect(none.available).toBe(false);
    expect(none.reason).toMatch(/no active variant/i);

    const stocked = purchaseState({ variants: [{ id: A }] });
    expect(stocked.available).toBe(false);
    expect(stocked.reason).toMatch(/checkout is not connected/i);
    // The two reasons are distinct, so the UI cannot show the wrong one.
    expect(none.reason).not.toBe(stocked.reason);
  });
});
