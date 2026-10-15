// T027b: seller form validation. The rules come from the shared contracts, so
// these tests prove the SHAPING is right (major units -> cents, `key = value`
// -> an attribute map) and that a rejection produces field-keyed, friendly
// errors while leaving the caller's values untouched (nothing to lose when the
// server says no).

import { describe, expect, it } from 'vitest';
import {
  formatAttributes,
  formatMajorUnits,
  parseAttributes,
  parsePrice,
  validateProductCreate,
  validateProductUpdate,
  validateVariantCreate,
  validateVariantUpdate,
  type ProductFormValues,
  type VariantFormValues,
} from '@/features/seller/validation';

const PRODUCT: ProductFormValues = {
  slug: 'desk-lamp',
  title: 'Desk Lamp',
  description: 'A lamp.',
  brand: 'Acme',
  attributes: 'color = Black',
};

const VARIANT: VariantFormValues = {
  sku: 'LAMP-BLK',
  price: '12.99',
  attributes: 'color = Black',
  status: 'active',
};

describe('attribute lines (T027b)', () => {
  it('parses key = value lines and ignores blank ones', () => {
    expect(parseAttributes('\ncolor = Black\n\n  size=M  \n')).toEqual({
      ok: true,
      value: { color: 'Black', size: 'M' },
    });
  });

  it('allows an empty value but not a missing key', () => {
    expect(parseAttributes('finish =')).toEqual({ ok: true, value: { finish: '' } });
    expect(parseAttributes('Black').ok).toBe(false);
    expect(parseAttributes('= Black').ok).toBe(false);
  });

  it('refuses a duplicated key instead of silently overwriting it', () => {
    const parsed = parseAttributes('color = Black\ncolor = White');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain('Duplicate');
  });

  it('round-trips an attribute map into editable text', () => {
    expect(formatAttributes({ color: 'Black', weight: 3 })).toBe('color = Black\nweight = 3');
  });
});

describe('price entry (T027b)', () => {
  it('converts major units to integer cents without float drift', () => {
    expect(parsePrice('12.99')).toEqual({ ok: true, cents: 1299 });
    expect(parsePrice('0')).toEqual({ ok: true, cents: 0 });
    expect(parsePrice(' 12.9 ')).toEqual({ ok: true, cents: 1290 });
    expect(parsePrice('100000')).toEqual({ ok: true, cents: 10_000_000 });
  });

  it('refuses shapes a seller could not mean', () => {
    expect(parsePrice('').ok).toBe(false);
    expect(parsePrice('.99').ok).toBe(false);
    expect(parsePrice('12.999').ok).toBe(false);
    expect(parsePrice('12,99').ok).toBe(false);
    expect(parsePrice('-1').ok).toBe(false);
    expect(parsePrice('abc').ok).toBe(false);
  });

  it('formats cents back into exact major units', () => {
    expect(formatMajorUnits(1299)).toBe('12.99');
    expect(formatMajorUnits(0)).toBe('0.00');
    expect(formatMajorUnits(5)).toBe('0.05');
  });
});

describe('product validation (T027b)', () => {
  it('accepts a create and applies the contract defaults', () => {
    const result = validateProductCreate(PRODUCT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.slug).toBe('desk-lamp');
      expect(result.data.categoryId).toBeNull();
      expect(result.data.currency).toBe('usd');
      expect(result.data.attributes).toEqual({ color: 'Black' });
    }
  });

  it('turns an empty brand into null rather than an empty string', () => {
    const result = validateProductCreate({ ...PRODUCT, brand: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.brand).toBeNull();
  });

  it('reports required and malformed fields by name, keeping the values', () => {
    const values: ProductFormValues = { ...PRODUCT, title: '', slug: 'Not A Slug' };
    const result = validateProductCreate(values);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors['title']).toBe('Title is required.');
      expect(result.errors['slug']).toBe('Slug has an invalid format.');
      expect(Object.keys(result.errors)).toHaveLength(2);
    }
    // The caller's object is untouched, so the form can re-render what was typed.
    expect(values.title).toBe('');
    expect(values.slug).toBe('Not A Slug');
  });

  it('surfaces an attribute-prose mistake as an attributes error', () => {
    const result = validateProductCreate({ ...PRODUCT, attributes: 'Black' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['attributes']).toContain('key = value');
  });

  it('never patches the slug or invents a category on an edit', () => {
    const result = validateProductUpdate({ ...PRODUCT, slug: 'renamed' }, 7);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.expectedVersion).toBe(7);
      expect(result.data).not.toHaveProperty('slug');
      expect(result.data).not.toHaveProperty('categoryId');
      expect(result.data.attributes).toEqual({ color: 'Black' });
    }
  });
});

describe('variant validation (T027b)', () => {
  it('accepts a create and converts the price', () => {
    const result = validateVariantCreate(VARIANT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.priceCents).toBe(1299);
      expect(result.data.sku).toBe('LAMP-BLK');
    }
  });

  it('reports the price and the SKU separately', () => {
    const result = validateVariantCreate({ ...VARIANT, sku: '', price: 'free' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors['sku']).toBe('SKU is required.');
      expect(result.errors['priceCents']).toBeDefined();
    }
  });

  it('keeps the SKU out of an edit (it is immutable) and keeps the status', () => {
    const result = validateVariantUpdate({ ...VARIANT, sku: 'CHANGED', status: 'inactive' }, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.expectedVersion).toBe(3);
      expect(result.data.status).toBe('inactive');
      expect(result.data).not.toHaveProperty('sku');
    }
  });

  it('rejects a price above the contract ceiling with a friendly message', () => {
    const result = validateVariantCreate({ ...VARIANT, price: '100001' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors['priceCents']).toBe('Price must be between $0.00 and $100,000.00.');
    }
  });
});
