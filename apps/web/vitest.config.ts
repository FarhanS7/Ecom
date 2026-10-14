import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**', '.next/**'],
    // No component tests yet (T007 owns the app shell; Testing Library
    // arrives with component work). Explicit flag; T008 revisits gates.
    passWithNoTests: true,
    env: { NODE_ENV: 'test' },
  },
});
