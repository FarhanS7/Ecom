// packages/backend/src/db/seed/copy-writer.test.ts - Unit tests for BulkCopyWriter & CSV formatting (TASK-077).
import { describe, expect, it } from 'vitest';
import { formatCsvRow } from './copy-writer.js';

describe('BulkCopyWriter & CSV Stream Formatting (TASK-077 Unit Tests)', () => {
  describe('formatCsvRow', () => {
    it('formats primitive numbers, strings, and booleans', () => {
      const row = ['prod-123', 4500, true, 'Active Widget'];
      const csv = formatCsvRow(row);
      expect(csv).toBe('prod-123,4500,true,Active Widget\n');
    });

    it('formats null and undefined as empty strings', () => {
      const row = ['item-1', null, undefined, 0];
      const csv = formatCsvRow(row);
      expect(csv).toBe('item-1,,,0\n');
    });

    it('escapes commas, quotes, and newlines per RFC 4180', () => {
      const row = [
        'He said, "Hello World"',
        'Multi-line\nDescription\r\nHere',
        'Normal text',
      ];
      const csv = formatCsvRow(row);
      expect(csv).toBe('"He said, ""Hello World""","Multi-line\nDescription\r\nHere",Normal text\n');
    });
  });
});
