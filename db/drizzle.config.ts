// Drizzle Kit configuration for ShopScale.
// Used only for `db:generate` (schema -> SQL review). Runtime migrations
// are applied by the reviewed runner in packages/backend/src/db/migrate.ts,
// never by automatic push/sync against shared data.

import type { Config } from 'drizzle-kit';

export default {
  schema: '../packages/backend/src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // drizzle-kit 0.20 reads `url` for postgres; fall back to local default
    // so `generate` works without a live database connection.
    url:
      process.env.DATABASE_URL ??
      'postgres://shopscale:shopscale@localhost:5432/shopscale',
  },
  verbose: true,
  strict: true,
} satisfies Config;
