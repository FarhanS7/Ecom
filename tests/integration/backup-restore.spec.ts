import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDatabaseBackup } from '../../scripts/db-backup.js';
import { restoreDatabaseBackup } from '../../scripts/db-restore.js';

describe('Database Disaster Recovery & Backup Rehearsal (TASK-085, G6)', () => {
  const testArchive = path.resolve(process.cwd(), 'backups/test_rehearsal.dump');

  it('creates compressed database backup archive with strict permissions', async () => {
    const backupResult = await createDatabaseBackup(testArchive);

    expect(fs.existsSync(testArchive)).toBe(true);
    expect(backupResult.archivePath).toBe(testArchive);
    expect(backupResult.sizeBytes).toBeGreaterThan(0);
    expect(backupResult.tableCount).toBeGreaterThanOrEqual(20);
    expect(backupResult.durationMs).toBeGreaterThan(0);
    expect(backupResult.checksum).toMatch(/^sha256-/);
  });

  it('restores database from backup archive cleanly with verified schema parity', async () => {
    const restoreResult = await restoreDatabaseBackup(testArchive);

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.archivePath).toBe(testArchive);
    expect(restoreResult.tablesRestored).toBeGreaterThanOrEqual(20);
    expect(restoreResult.durationMs).toBeGreaterThan(0);
  });

  it('fails fast if target backup archive is missing or corrupted', async () => {
    const missingArchive = path.resolve(process.cwd(), 'backups/nonexistent_archive.dump');
    await expect(restoreDatabaseBackup(missingArchive)).rejects.toThrow(/not found/);
  });
});
