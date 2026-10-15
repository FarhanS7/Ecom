import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**', '.next/**'],
    // Component work arrives with T023 (design-system foundation): jsdom +
    // Testing Library, so .tsx component state tests run in a real DOM.
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    passWithNoTests: true,
    env: { NODE_ENV: 'test' },
  },
});
