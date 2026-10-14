// T014a: grant-table invariants. The map must mirror the 0002 seed exactly;
// these assertions trip on any drift in either direction.

import { describe, expect, it } from 'vitest';
import { STORE_PERMISSIONS, STORE_ROLES, STORE_ROLE_GRANTS } from './permissions.js';

describe('store grants (T014a)', () => {
  it('covers four roles and five permissions', () => {
    expect([...STORE_ROLES]).toEqual(['owner', 'manager', 'catalog-editor', 'fulfillment']);
    expect([...STORE_PERMISSIONS]).toEqual([
      'catalog:manage',
      'fulfillment:manage',
      'team:manage',
      'store:manage',
      'reports:read',
    ]);
  });

  it('gives owners everything and editors only catalog', () => {
    expect([...STORE_ROLE_GRANTS.owner]).toHaveLength(5);
    expect([...STORE_ROLE_GRANTS['catalog-editor']]).toEqual(['catalog:manage']);
    expect([...STORE_ROLE_GRANTS.fulfillment]).toEqual(['fulfillment:manage']);
  });

  it('keeps catalog editors out of fulfillment', () => {
    expect(STORE_ROLE_GRANTS['catalog-editor']).not.toContain('fulfillment:manage');
  });

  it('grants only known permissions', () => {
    const known = new Set(STORE_PERMISSIONS);
    for (const grants of Object.values(STORE_ROLE_GRANTS)) {
      for (const permission of grants) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });
});
