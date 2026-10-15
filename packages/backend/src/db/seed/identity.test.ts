// T028a: the identity fixtures. The interesting assertions are the ones about
// SCOPE (who owns nothing, who owns something they must not reach) and about
// determinism (no wall clock, no ambient randomness).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORE_ROLE_GRANTS, roleGrants } from '../../stores/permissions.js';
import { SEED_EPOCH_MS, isoAt, uuidV5 } from './random.js';
import {
  SEED_DEMO_PASSWORD_HASH,
  SEED_EMAIL_PREFIX,
  SEED_SLUG_PREFIX,
  TIER_S_SHAPE,
  identityUserIds,
  orderedStores,
  planIdentity,
  shapeForSize,
  type IdentityPlan,
  type SeedShape,
} from './identity.js';

const SHAPE: SeedShape = {
  stores: 3,
  emptyStores: 0,
  productsPerStore: 4,
  variantsPerProduct: [2, 3],
  categories: 3,
  staffPerStore: 3,
};

function plan(seed = 42, shape: SeedShape = SHAPE): IdentityPlan {
  return planIdentity({ seed, shape });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('plan determinism (T028a)', () => {
  it('returns byte-identical plans for the same seed', () => {
    expect(plan()).toEqual(plan());
  });

  it('does not read the clock', () => {
    const before = plan();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T12:34:56.000Z'));
    const after = plan();
    vi.useRealTimers();
    expect(after).toEqual(before);
  });

  it('changes the seeded values when the seed changes', () => {
    const a = plan(42);
    const b = plan(43);
    expect(a.businesses.map((row) => row.commission_bps)).not.toEqual(
      b.businesses.map((row) => row.commission_bps),
    );
  });

  it('derives ids from names, not from generation order', () => {
    const planA = plan();
    for (const store of orderedStores(planA)) {
      expect(store.storeId).toBe(uuidV5(`store:${store.slug}`));
      expect(planA.stores.find((row) => row.id === store.storeId)?.slug).toBe(store.slug);
    }
    // Adding a fourth store must not move the first three.
    const wider = plan(42, { ...SHAPE, stores: 4 });
    expect(wider.stores.slice(0, 3)).toEqual(planA.stores);
  });

  it('stamps timestamps from the fixed epoch, not from now()', () => {
    const rows = plan().users;
    expect(rows[0]?.created_at).toBe(isoAt(0));
    expect(rows.every((row) => Date.parse(row.created_at) >= SEED_EPOCH_MS)).toBe(true);
    expect(rows.every((row) => row.created_at === row.updated_at)).toBe(true);
  });

  it('marks every fixture row so a cleanup can find it', () => {
    const fixture = plan();
    expect(fixture.users.every((row) => row.email_normalized.startsWith(SEED_EMAIL_PREFIX))).toBe(true);
    expect(fixture.stores.every((row) => row.slug.startsWith(SEED_SLUG_PREFIX))).toBe(true);
    expect(fixture.users.every((row) => row.password_hash === SEED_DEMO_PASSWORD_HASH)).toBe(true);
  });
});

describe('the empty account (T028a)', () => {
  it('owns no business, store, or membership', () => {
    const fixture = plan();
    const id = fixture.accounts.emptyAccountUserId;
    expect(fixture.users.some((row) => row.id === id)).toBe(true);
    expect(fixture.stores).toHaveLength(SHAPE.stores);
    expect(fixture.businesses.some((row) => row.owner_user_id === id)).toBe(false);
    expect(fixture.memberships.some((row) => row.user_id === id)).toBe(false);
    // A plain customer: the platform role proves the account is legitimate, not
    // just missing.
    expect(fixture.platformRoles).toContainEqual({ user_id: id, role_key: 'customer' });
    expect(fixture.platformRoles.filter((row) => row.user_id === id)).toHaveLength(1);
  });

  it('is the only account without a platform role beyond customer', () => {
    const fixture = plan();
    const admins = fixture.platformRoles.filter((row) => row.role_key === 'admin');
    expect(admins).toHaveLength(1);
    expect(admins[0]?.user_id).toBe(fixture.accounts.adminUserId);
    expect(fixture.users.map((row) => row.id)).toContain(fixture.accounts.adminUserId);
  });
});

describe('scoped staff (T028a)', () => {
  it('gives every store an owner and the configured staff roles', () => {
    const fixture = plan();
    for (const store of orderedStores(fixture)) {
      const rows = fixture.memberships.filter((row) => row.store_id === store.storeId);
      expect(rows.map((row) => row.role_key).sort()).toEqual(
        ['catalog-editor', 'fulfillment', 'manager', 'owner'].sort(),
      );
      expect(store.ownerUserId).toBe(
        fixture.memberships.find((row) => row.store_id === store.storeId && row.role_key === 'owner')?.user_id,
      );
      expect(store.staff.map((member) => member.role)).toEqual(['manager', 'catalog-editor', 'fulfillment']);
      expect(rows.every((row) => row.status === 'active')).toBe(true);
    }
  });

  it('mirrors the role grants the authorizer actually uses', () => {
    const fixture = plan();
    for (const store of orderedStores(fixture)) {
      const catalogEditor = store.staff.find((member) => member.role === 'catalog-editor');
      const fulfillment = store.staff.find((member) => member.role === 'fulfillment');
      expect(roleGrants('catalog-editor')).toEqual(['catalog:manage']);
      expect(roleGrants('fulfillment')).toEqual(['fulfillment:manage']);
      // The interesting half: each scoped role must LACK the other's permission.
      expect(roleGrants('catalog-editor')).not.toContain('fulfillment:manage');
      expect(roleGrants('fulfillment')).not.toContain('catalog:manage');
      expect(catalogEditor?.role).toBe('catalog-editor');
      expect(fulfillment?.role).toBe('fulfillment');
      // Owner holds everything, which is what makes it the interesting foil.
      expect([...roleGrants('owner')].sort()).toEqual([...STORE_ROLE_GRANTS.owner].sort());
    }
  });

  it('makes the foreign seller a REAL seller of another store', () => {
    const fixture = plan();
    const stores = orderedStores(fixture);
    const first = stores[0]!;
    const last = stores[stores.length - 1]!;
    expect(fixture.accounts.foreignSellerUserId).toBe(last.ownerUserId);
    expect(last.ownerUserId).not.toBe(first.ownerUserId);
    // Authorised somewhere, refused here: the T018 uniform-404 case, not "unknown user".
    expect(
      fixture.memberships.some(
        (row) => row.user_id === fixture.accounts.foreignSellerUserId && row.store_id === last.storeId,
      ),
    ).toBe(true);
    expect(
      fixture.memberships.some(
        (row) => row.user_id === fixture.accounts.foreignSellerUserId && row.store_id === first.storeId,
      ),
    ).toBe(false);
  });

  it('uses one business per store, each with a distinct owner (D-007)', () => {
    const fixture = plan();
    const businessIds = fixture.businesses.map((row) => row.id);
    expect(new Set(businessIds).size).toBe(fixture.businesses.length);
    expect(fixture.businesses).toHaveLength(fixture.stores.length);
    const owners = fixture.businesses.map((row) => row.owner_user_id);
    expect(new Set(owners).size).toBe(owners.length);
    for (const store of fixture.stores) {
      expect(fixture.businesses.find((row) => row.id === store.business_id)).toBeDefined();
    }
  });

  it('accounts for every user it creates', () => {
    const fixture = plan();
    expect(fixture.users).toHaveLength(2 + SHAPE.stores * (1 + SHAPE.staffPerStore));
    expect(new Set(identityUserIds(fixture)).size).toBe(fixture.users.length);
    expect(fixture.memberships).toHaveLength(SHAPE.stores * (1 + SHAPE.staffPerStore));
  });
});

describe('seed sizes (T028a)', () => {
  it('implements Tier S and refuses the streaming tiers by name', () => {
    expect(shapeForSize('s')).toEqual(TIER_S_SHAPE);
    const catalogued = TIER_S_SHAPE.productsPerStore * (TIER_S_SHAPE.stores - TIER_S_SHAPE.emptyStores);
    expect(catalogued).toBeGreaterThanOrEqual(1000);
    expect(TIER_S_SHAPE.emptyStores).toBeGreaterThanOrEqual(1);
    for (const size of ['m', 'l', 'xl'] as const) {
      expect(() => shapeForSize(size)).toThrow(/T077/);
    }
  });
});
