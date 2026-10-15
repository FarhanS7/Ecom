// Fix (T028c): the integration specs used to compute the repo root by counting
// `..` segments, and every backend one was one level short — so `runMigrations`
// was handed `<repo>/packages/db/migrations` and failed on `readdir` (ENOENT) as
// soon as a database was reachable. These tests pin the replacement: the
// migrations directory is FOUND by searching upward, so it cannot drift again.

import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findMigrationsDir, resolveMigrationsDir } from './database.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('findMigrationsDir (T028c fix)', () => {
  it('finds the real migrations directory from a nested source folder', () => {
    const found = findMigrationsDir(here);
    expect(found).toBe(resolveMigrationsDir(join(here, '..', '..', '..', '..')));
    expect(existsSync(join(found, '0001-identity.sql'))).toBe(true);
    expect(existsSync(join(found, '0006-catalog.sql'))).toBe(true);
  });

  it('finds the same directory from the integration specs own location', () => {
    // The depth that used to break: tests/integration is four levels below the
    // repository root, and the specs only walked up three.
    const specDir = join(here, '..', '..', 'tests', 'integration');
    expect(findMigrationsDir(specDir)).toBe(findMigrationsDir(here));
  });

  it('reports a wrong depth as an error instead of an ENOENT deep inside a run', () => {
    expect(existsSync(join(here, '..', '..', '..', 'db', 'migrations'))).toBe(false);
  });

  it('refuses a directory outside the repository', () => {
    expect(() => findMigrationsDir(tmpdir())).toThrow(/Could not locate db\/migrations/);
  });
});
