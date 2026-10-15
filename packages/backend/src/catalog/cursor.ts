// @shopscale/backend/catalog/cursor - Opaque keyset cursors (T022a).
// A cursor is base64url(JSON) carrying: version, the sort it was issued
// for, a fingerprint of the channel + filters it was issued under, and the
// last row's (sortValue, id) tuple. It is opaque to clients on purpose:
// nothing about its structure is a contract, so the tuple format can
// change without a breaking API change.
//
// Binding the cursor to sort + filters is what makes it "validated": a
// cursor from the marketplace cannot be replayed against a store channel,
// and a cursor issued under one price band cannot be replayed under
// another — both are typed rejections, not silently different results.
//
// The codec is pure (no DB, no secrets): catalog reads are public, so a
// tampered cursor can at most skip/duplicate the caller's OWN pages; there
// is no cross-user data to protect and no reason to pay for an HMAC.

import { createHash } from 'node:crypto';

export type CatalogChannel = 'marketplace' | 'store';
export type CatalogSort = 'newest' | 'price_asc' | 'price_desc' | 'popularity';

export const CATALOG_SORTS: readonly CatalogSort[] = ['newest', 'price_asc', 'price_desc', 'popularity'];

/** Hard cap so a hostile cursor cannot force unbounded JSON parsing. */
export const MAX_CURSOR_LENGTH = 512;

/** Fingerprint width in hex chars (64 bits): collision-free for this use. */
const FINGERPRINT_HEX = 16;

export interface CursorPayload {
  v: 1;
  sort: CatalogSort;
  /** Fingerprint of channel + filter set the cursor was issued under. */
  f: string;
  /** Last row's (sortValue, id): ISO timestamp or number, plus uuid. */
  k: [string | number, string];
}

export interface CursorFilterInput {
  channel: CatalogChannel;
  storeSlug?: string | undefined;
  categorySlug?: string | undefined;
  minPriceCents?: number | undefined;
  maxPriceCents?: number | undefined;
  sort?: CatalogSort | undefined;
}

/**
 * Pure: deterministic fingerprint of the channel + filters (+ sort). Any
 * change to the filter set changes the fingerprint, so a stale cursor is
 * rejected rather than silently returning a different result set.
 */
export function filterFingerprint(input: CursorFilterInput): string {
  const canonical = [
    input.channel,
    input.storeSlug ?? '',
    input.categorySlug ?? '',
    input.minPriceCents ?? -1,
    input.maxPriceCents ?? -1,
    input.sort ?? 'newest',
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, FINGERPRINT_HEX);
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function isTupleValue(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Structural validation only: returns null for anything that is not a
 * well-formed, current-version cursor. Callers treat null as "no cursor"
 * (first page) — never as an error surface that could leak internals.
 */
export function decodeCursor(raw: string): CursorPayload | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const candidate = json as Record<string, unknown>;
  if (candidate['v'] !== 1) return null;
  if (typeof candidate['sort'] !== 'string' || !CATALOG_SORTS.includes(candidate['sort'] as CatalogSort)) return null;
  const fingerprint = candidate['f'];
  if (typeof fingerprint !== 'string' || !new RegExp(`^[0-9a-f]{${FINGERPRINT_HEX}}$`).test(fingerprint)) return null;
  const key = candidate['k'];
  if (!Array.isArray(key) || key.length !== 2) return null;
  const [value, id] = key as [unknown, unknown];
  if (!isTupleValue(value)) return null;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  return { v: 1, sort: candidate['sort'] as CatalogSort, f: fingerprint, k: [value, id] };
}
