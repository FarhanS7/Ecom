import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shopscale/config': resolve(here, 'packages/config/src/index.ts'),
      '@shopscale/contracts': resolve(here, 'packages/contracts/src/index.ts'),
      '@shopscale/backend': resolve(here, 'packages/backend/src/index.ts'),
    },
  },
  test: {
    include: ['tests/chaos/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: { NODE_ENV: 'test' },
  },
});
