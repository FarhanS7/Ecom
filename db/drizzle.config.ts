// Drizzle Kit configuration for ShopScale.
// Used only for `db:generate` (schema -> SQL review). Runtime migrations
// are applied by the reviewed runner in packages/backend/src/db/migrate.ts,
// never by automatic push/sync against shared data.
//
// Path note: drizzle-kit resolves `schema`/`out` relative to the WORKING
// DIRECTORY, not this file. Always run via `pnpm db:migrate|generate` from
// packages/backend (see its package.json scripts). `schema` is an entry
// ARRAY (one dependency-free file per module); cross-module FKs live in
// reviewed SQL because schema files cannot import each other portably.

import type { Config } from 'drizzle-kit';

export default {
  schema: ['./src/db/schema.ts', './src/identity/schema.ts', './src/stores/schema.ts', './src/platform/schema.ts'],
  out: '../../db/migrations',
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
