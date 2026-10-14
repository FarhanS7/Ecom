import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.spec.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: { NODE_ENV: 'test' },
  },
});
