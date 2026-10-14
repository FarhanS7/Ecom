import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.spec.ts', 'tests/**', 'node_modules/**'],
    env: { NODE_ENV: 'test' },
  },
});
