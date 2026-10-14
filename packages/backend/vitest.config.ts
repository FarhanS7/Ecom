import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.spec.ts', 'tests/**', 'node_modules/**'],
    env: { NODE_ENV: 'test' },
    // Serialized in one process: suites mutate process.env (server-only
    // config cache), and threads would share it across files. Deterministic
    // beats parallel here; integration config already serializes the same way.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
