// T009: identity schema module loads with the expected tables.
// Guards the generate-diff chain: if a table is renamed here but not in the
// reviewed SQL (or vice versa), this is the first tripwire.

import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import * as schema from './schema.js';

describe('identity schema (T009)', () => {
  it('exposes every modeled table under its migration name', () => {
    expect(getTableName(schema.users)).toBe('users');
    expect(getTableName(schema.platformRoles)).toBe('platform_roles');
    expect(getTableName(schema.permissions)).toBe('permissions');
    expect(getTableName(schema.platformRolePermissions)).toBe('platform_role_permissions');
    expect(getTableName(schema.userPlatformRoles)).toBe('user_platform_roles');
    expect(getTableName(schema.sessionFamilies)).toBe('session_families');
    expect(getTableName(schema.refreshTokens)).toBe('refresh_tokens');
    expect(getTableName(schema.identityTokens)).toBe('identity_tokens');
  });
});
