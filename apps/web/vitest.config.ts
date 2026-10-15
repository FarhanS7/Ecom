import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Same `@/*` → `src/*` mapping the app uses (Next resolves it from
  // tsconfig paths); Vitest needs it declared explicitly.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Next compiles JSX with SWC (automatic runtime); tsconfig keeps
  // `jsx: preserve`, so Vitest must opt into the automatic runtime itself —
  // otherwise esbuild emits React.createElement and every component test
  // dies with "React is not defined".
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
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
