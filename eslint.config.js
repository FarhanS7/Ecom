// Root ESLint flat config (T008). Covers app workspace code only:
// apps/**, packages/**, scripts/**, tests/**, root configs. Downloaded
// references under skills/** are NEVER linted (see pnpm-workspace.yaml).
//
// Two tiers: type-aware rules for sources inside a tsconfig (strongest
// signal), plain recommended rules for tests/tooling configs outside any
// tsconfig (projectService cannot see them; tsc still checks tests via each
// package's tsconfig.typecheck.json).
//
// Operational console.* logging (server boot, scripts, redacted errors) is
// intentional and reviewed — the gate forbids `debugger` and stray secrets,
// not logging. Prettier formatting checks are NOT included (no prettier
// binary; eslint-config-prettier only disables conflicting stylistic rules).

import eslintJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

const sharedRules = {
  // Secrets/logging: reviewed intentionally; ban the debugger instead.
  'no-debugger': 'error',
  // Error objects must stay redacted at boundaries; this rule cannot prove
  // that, so the redaction tests (not the linter) own the guarantee.
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'skills/**',
      '**/*.d.ts',
    ],
  },
  eslintJs.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Sources inside a tsconfig: full type-aware rules. Tests and tooling
    // configs are excluded here (covered by the plain block below).
    files: ['apps/*/src/**/*.ts', 'apps/*/src/**/*.tsx', 'packages/*/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true },
    },
    rules: sharedRules,
  },
  {
    // Browser sources: same rules plus browser globals.
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Tests and tooling configs: outside any tsconfig, so plain recommended
    // rules (no type-aware rules that need projectService).
    files: [
      '**/*.test.ts',
      '**/*.spec.ts',
      'tests/**/*.ts',
      '**/vitest.config.ts',
      '**/vitest.integration.config.ts',
      'playwright.config.ts',
      'eslint.config.js',
    ],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-debugger': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  eslintConfigPrettier,
);
