// T022a: cursor codec and keyset builder, without a database.
// The page-walk proof (duplicate prices/timestamps, no duplicate IDs) is
// live in pagination.spec.ts (CI).

import { describe, expect, it } from 'vitest';
import { CATALOG_SORTS, decodeCursor, encodeCursor, filterFingerprint, MAX_CURSOR_LENGTH } from './cursor.js';
import { ORDER_FRAGMENTS, buildListQuery, cursorTupleForRow, CursorError } from './list-query.js';

describe('cursor codec (T022a)', () => {
  it('round-trips a payload through base64url', () => {
    const payload = { v: 1 as const, sort: 'price_asc' as const, f: 'abcdef0123456789', k: [1234, 'a-uuid'] as [number, string] };
    const decoded = decodeCursor(encodeCursor(payload));
    expect(decoded).toEqual(payload);
  });

  it('rejects malformed, wrong-version, and out-of-range cursors', () => {
    expect(decodeCursor('not-base64url-json')).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('x'.repeat(MAX_CURSOR_LENGTH + 1))).toBeNull();
    // Valid base64url JSON, but wrong version / bad sort / bad fingerprint.
    expect(decodeCursor(Buffer.from(JSON.stringify({ v: 2, sort: 'newest', f: 'abcdef0123456789', k: [1, 'x'] })).toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ v: 1, sort: 'rating', f: 'abcdef0123456789', k: [1, 'x'] })).toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ v: 1, sort: 'newest', f: 'nope', k: [1, 'x'] })).toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ v: 1, sort: 'newest', f: 'abcdef0123456789', k: [1] })).toString('base64url'))).toBeNull();
  });
});

describe('filter fingerprint (T022a)', () => {
  it('is stable for identical filters and changes with any filter/channel', () => {
    const base = { channel: 'marketplace' as const, sort: 'newest' as const, minPriceCents: 100, maxPriceCents: 500 };
    expect(filterFingerprint(base)).toBe(filterFingerprint({ ...base }));
    expect(filterFingerprint(base)).not.toBe(filterFingerprint({ ...base, channel: 'store', storeSlug: 's' }));
    expect(filterFingerprint(base)).not.toBe(filterFingerprint({ ...base, minPriceCents: 101 }));
    expect(filterFingerprint(base)).not.toBe(filterFingerprint({ ...base, sort: 'price_asc' }));
  });
});

describe('keyset query builder (T022a)', () => {
  it('maps every sort to an id-tiebroken order and a matching row comparison', () => {
    for (const sort of CATALOG_SORTS) {
      expect(ORDER_FRAGMENTS[sort]).toContain('"p"."id"');
    }
    const newest = buildListQuery({ channel: 'marketplace', sort: 'newest', cursor: encodeCursor({ v: 1, sort: 'newest', f: filterFingerprint({ channel: 'marketplace', sort: 'newest' }), k: ['2026-01-01T00:00:00.000Z', 'id-1'] }) });
    expect(newest.text).toContain('("p"."created_at","p"."id") < ($7::timestamptz,$8::uuid)');
    expect(newest.args).toEqual(['marketplace', '', '', -1, -1, '', '2026-01-01T00:00:00.000Z', 'id-1']);
    const asc = buildListQuery({ channel: 'marketplace', sort: 'price_asc', cursor: encodeCursor({ v: 1, sort: 'price_asc', f: filterFingerprint({ channel: 'marketplace', sort: 'price_asc' }), k: [500, 'id-2'] }) });
    expect(asc.text).toContain('("p"."min_price_cents","p"."id") > ($7::bigint,$8::uuid)');
  });

  it('bounds the limit and fetches one extra row for next-page detection', () => {
    expect(buildListQuery({ channel: 'marketplace', limit: 0 }).limit).toBe(1);
    expect(buildListQuery({ channel: 'marketplace', limit: 500 }).limit).toBe(100);
    expect(buildListQuery({ channel: 'marketplace', limit: 5 }).text).toContain('LIMIT 6;');
    expect(buildListQuery({ channel: 'marketplace' }).text).toContain('LIMIT 21;');
  });

  it('rejects a wrong-sort cursor and a changed-channel/filter cursor', () => {
    const issued = encodeCursor({ v: 1, sort: 'newest', f: filterFingerprint({ channel: 'marketplace', sort: 'newest' }), k: ['2026-01-01T00:00:00.000Z', 'id-1'] });
    expect(() => buildListQuery({ channel: 'marketplace', sort: 'price_asc', cursor: issued })).toThrow(CursorError);
    // Same cursor (newest fingerprint) replayed on the STORE channel.
    expect(() => buildListQuery({ channel: 'store', storeSlug: 's', sort: 'newest', cursor: issued })).toThrow(CursorError);
    // Same cursor, same channel, but a changed price filter.
    expect(() => buildListQuery({ channel: 'marketplace', sort: 'newest', minPriceCents: 1, cursor: issued })).toThrow(CursorError);
  });

  it('derives the next tuple from the row under the active sort', () => {
    expect(cursorTupleForRow('newest', { created_at: new Date('2026-02-02T00:00:00.000Z'), id: 'abc' })).toEqual([
      '2026-02-02T00:00:00.000Z',
      'abc',
    ]);
    expect(cursorTupleForRow('price_desc', { min_price_cents: '9900', id: 'abc' })).toEqual([9900, 'abc']);
    expect(cursorTupleForRow('popularity', { sales_count: 7, id: 'abc' })).toEqual([7, 'abc']);
  });
});
