// T020a: catalog contract edges without a database.
// Version fields are mandatory on updates, money is nonnegative integer
// cents with a demo ceiling, slugs are kebab-case — all enforced at the
// contract boundary before any SQL runs.

import { describe, expect, it } from 'vitest';
import {
  productCreateRequest,
  productUpdateRequest,
  publicationToggleRequest,
  variantCreateRequest,
  variantUpdateRequest,
} from './catalog.js';

describe('catalog contracts (T020a)', () => {
  it('accepts a minimal product create and applies documented defaults', () => {
    const parsed = productCreateRequest.parse({ categoryId: null, slug: 'desk-lamp', title: 'Desk Lamp' });
    expect(parsed.description).toBe('');
    expect(parsed.brand).toBeNull();
    expect(parsed.currency).toBe('usd');
    expect(parsed.attributes).toEqual({});
  });

  it('rejects bad slugs and negative or overflowing money', () => {
    expect(productCreateRequest.safeParse({ categoryId: null, slug: 'Desk Lamp!', title: 'x' }).success).toBe(false);
    expect(productCreateRequest.safeParse({ categoryId: null, slug: '-edge', title: 'x' }).success).toBe(false);
    expect(variantCreateRequest.safeParse({ sku: 'A1', priceCents: -1 }).success).toBe(false);
    expect(variantCreateRequest.safeParse({ sku: 'A1', priceCents: 10_000_001 }).success).toBe(false);
    expect(variantCreateRequest.safeParse({ sku: 'A1', priceCents: 10_000_000 }).success).toBe(true);
  });

  it('requires expectedVersion on every update (optimistic concurrency)', () => {
    expect(productUpdateRequest.safeParse({ title: 'no version' }).success).toBe(false);
    expect(productUpdateRequest.safeParse({ expectedVersion: 1, title: 'ok' }).success).toBe(true);
    expect(variantUpdateRequest.safeParse({ priceCents: 5 }).success).toBe(false);
    expect(variantUpdateRequest.safeParse({ expectedVersion: 2, status: 'inactive' }).success).toBe(true);
    // Zero/negative versions are contract-invalid, not a runtime surprise.
    expect(productUpdateRequest.safeParse({ expectedVersion: 0 }).success).toBe(false);
  });

  it('keeps publication toggles independent and optional', () => {
    expect(publicationToggleRequest.parse({ marketplaceEnabled: true })).toEqual({ marketplaceEnabled: true });
    expect(publicationToggleRequest.parse({ storeEnabled: false })).toEqual({ storeEnabled: false });
    expect(publicationToggleRequest.safeParse({}).success).toBe(true);
  });
});
