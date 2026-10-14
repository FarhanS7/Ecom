import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.spec.ts'],
    // No worker integration tests yet (loops arrive in T029). Explicit flag;
    // T008 revisits coverage gates.
    passWithNoTests: true,
    env: { NODE_ENV: 'test' },
  },
});
