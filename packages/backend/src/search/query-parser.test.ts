// Unit tests for search query parser (T031)
import { describe, expect, it } from 'vitest';
import { parseTsQuery, sanitizeSearchQuery } from './query-parser.js';

describe('Search Query Parser (T031)', () => {
  it('strips special characters and returns clean search terms', () => {
    expect(sanitizeSearchQuery("lamp! & (desk)* 'blue' <red> \\")).toBe('lamp desk blue red');
    expect(sanitizeSearchQuery('   ')).toBe('');
  });

  it('converts terms to tsquery prefix format with & operator', () => {
    expect(parseTsQuery('running shoes')).toBe('running:* & shoes:*');
    expect(parseTsQuery('lamp')).toBe('lamp:*');
    expect(parseTsQuery('wireless   bluetooth   headphones')).toBe('wireless:* & bluetooth:* & headphones:*');
  });

  it('safely handles injection characters and malformed punctuation', () => {
    expect(parseTsQuery("'; DROP TABLE products; --")).toBe('DROP:* & TABLE:* & products:*');
    expect(parseTsQuery('!&|():*')).toBeNull();
    expect(parseTsQuery('')).toBeNull();
    expect(parseTsQuery('   ')).toBeNull();
  });
});
