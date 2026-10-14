import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    // No unit tests yet (worker loops arrive in T029). Explicit flag;
    // T008 revisits coverage gates.
    passWithNoTests: true,
    env: { NODE_ENV: 'test' },
  },
});
