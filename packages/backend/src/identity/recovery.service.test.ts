// T012a: recovery decisions with fixed clocks — no database, no sleeps.
// The predicate table (valid/expired/consumed/wrong-purpose) is pure; the
// transactional paths are proven over HTTP in T012b.

import { describe, expect, it } from 'vitest';
import { isUsableToken } from './recovery.service.js';
import type { ProofRow } from './recovery.service.js';

const NOW = new Date('2026-10-15T00:00:00.000Z');
const PAST = new Date('2026-10-14T00:00:00.000Z');
const FUTURE = new Date('2026-10-15T01:00:00.000Z');

function row(overrides: Partial<ProofRow> = {}): ProofRow {
  return {
    id: 'p1',
    user_id: 'u1',
    purpose: 'reset',
    token_hash: 'h',
    expires_at: FUTURE,
    consumed_at: null,
    user_status: 'active',
    ...overrides,
  };
}

describe('proof usability (T012a)', () => {
  it('accepts a live proof and rejects every dead shape', () => {
    expect(isUsableToken(row(), 'reset', NOW)).toBe(true);
    expect(isUsableToken(null, 'reset', NOW)).toBe(false);
    expect(isUsableToken(row({ consumed_at: PAST }), 'reset', NOW)).toBe(false);
    expect(isUsableToken(row({ expires_at: PAST }), 'reset', NOW)).toBe(false);
    expect(isUsableToken(row({ expires_at: NOW }), 'reset', NOW)).toBe(false);
    expect(isUsableToken(row({ purpose: 'verification' }), 'reset', NOW)).toBe(false);
    expect(isUsableToken(row(), 'verification', NOW)).toBe(false);
  });
});
