// @shopscale/backend/search/query-parser - tsquery sanitizer and parser (T031).
// Invariant: User query strings are never concatenated directly into raw SQL.
// Special characters that can corrupt to_tsquery are stripped.

/**
 * Strips tsquery operators, punctuation, and control characters.
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';
  return query
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // retain only letters, numbers, and spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts a raw search query into a Postgres prefix tsquery string (e.g. "lamp:* & desk:*").
 * Returns null if the sanitized query has no alphanumeric tokens.
 */
export function parseTsQuery(rawQuery: string): string | null {
  const sanitized = sanitizeSearchQuery(rawQuery);
  if (!sanitized) return null;

  const tokens = sanitized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  // Append :* for prefix matching on each token
  return tokens.map((token) => `${token}:*`).join(' & ');
}
