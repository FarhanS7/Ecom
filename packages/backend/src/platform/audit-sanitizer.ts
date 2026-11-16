// @shopscale/backend/platform/audit-sanitizer - Redacts sensitive tokens & truncates large payloads (T062).
// Invariants:
// 1. Redacts passwords, bearer tokens, API secrets, cookies, session IDs, CVVs, and credit card PANs.
// 2. Truncates strings exceeding 1,000 characters to prevent database bloat.
// 3. Handles recursive nested objects and arrays with a depth limit to avoid stack overflow.
// 4. Returns deterministic, JSON-safe sanitized objects.

const SENSITIVE_KEY_REGEX = /(?:password|passwd|token|secret|authorization|cookie|session_?id|credit_?card|card_?number|pan|cvv|cvc|ssn|private_?key)/i;

// Luhn-like or 13-19 digit card numbers with optional dashes or spaces
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

const MAX_STRING_LENGTH = 1000;
const MAX_DEPTH = 8;

export function sanitizeAuditPayload(
  payload: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload !== 'object') {
    return { value: sanitizeValue(payload, depth) };
  }

  if (Array.isArray(payload)) {
    return { items: sanitizeArray(payload, depth) };
  }

  return sanitizeObject(payload as Record<string, unknown>, depth);
}

function sanitizeObject(
  obj: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  if (depth >= MAX_DEPTH) {
    return { _truncated: '[MAX_DEPTH_REACHED]' };
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeValue(value, depth + 1);
    }
  }

  return result;
}

function sanitizeArray(arr: unknown[], depth: number): unknown[] {
  if (depth >= MAX_DEPTH) {
    return ['[MAX_DEPTH_REACHED]'];
  }

  return arr.map((item) => sanitizeValue(item, depth + 1));
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    let sanitized = value;
    if (CREDIT_CARD_REGEX.test(sanitized)) {
      sanitized = sanitized.replace(CREDIT_CARD_REGEX, '[REDACTED_PAN]');
    }
    if (sanitized.length > MAX_STRING_LENGTH) {
      return `${sanitized.slice(0, MAX_STRING_LENGTH)}... [TRUNCATED]`;
    }
    return sanitized;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return sanitizeArray(value, depth);
  }

  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>, depth);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return null;
}
