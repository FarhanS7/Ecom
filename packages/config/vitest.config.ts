import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    // Schema-only package: no unit tests yet. Green-by-vacuity would be a
    // lie if hidden; this flag is explicit and T008 revisits coverage gates.
    passWithNoTests: true,
    env: { NODE_ENV: 'test' },
  },
});
