// @shopscale/web features/seller/validation - Seller form validation (T027b).
// PURE module: no fetch, no cookies, no server-only imports, so the server
// action and any client-side hint can share it.
//
// The rules are NOT re-implemented here. The console shapes the typed values
// (price in MAJOR units, attributes as `key = value` lines) and then parses the
// result with the SAME contract schemas the API enforces, so the seller screen
// can never invent a rule the API does not have — and never miss one it does.
// Every failure becomes a field-keyed message plus the entered values, because
// "preserves entered data after server rejection" is part of the interaction
// contract (docs/architecture/frontend.md).

import {
  productCreateRequest,
  productUpdateRequest,
  variantCreateRequest,
  variantUpdateRequest,
} from '@shopscale/contracts';
import type {
  ProductCreateRequest,
  ProductUpdateRequest,
  VariantCreateRequest,
  VariantUpdateRequest,
} from '@shopscale/contracts';

/** Field name → message. `form` is the summary bucket for cross-field issues. */
export type FieldErrors = Record<string, string>;

export type Validated<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/** Product fields the console edits. Slug is create-only (public URLs depend
 * on it); categoryId is absent until a categories feed exists (T025 note). */
export interface ProductFormValues {
  slug: string;
  title: string;
  description: string;
  brand: string;
  /** `key = value` lines — the text form of the product's attribute map. */
  attributes: string;
}

export interface VariantFormValues {
  sku: string;
  /** Major units exactly as typed, e.g. "12.99". */
  price: string;
  attributes: string;
  status: 'active' | 'inactive';
}

const LABELS: Record<string, string> = {
  slug: 'Slug',
  title: 'Title',
  description: 'Description',
  brand: 'Brand',
  attributes: 'Attributes',
  sku: 'SKU',
  priceCents: 'Price',
  status: 'Status',
  currency: 'Currency',
  categoryId: 'Category',
};

/** Structural stand-in for a zod issue: the contracts package owns zod, the
 * web app never imports it directly (it is not a declared dependency). */
interface IssueLike {
  path: Array<string | number>;
  code: string;
  message: string;
}

function friendly(field: string, code: string, message: string): string {
  const label = LABELS[field] ?? field;
  if (field === 'priceCents' && (code === 'too_small' || code === 'too_big')) {
    return 'Price must be between $0.00 and $100,000.00.';
  }
  switch (code) {
    case 'too_small':
      return `${label} is required.`;
    case 'too_big':
      return `${label} is too long.`;
    case 'invalid_type':
      return `${label} is required.`;
    case 'invalid_string':
      return `${label} has an invalid format.`;
    case 'invalid_enum_value':
      return `${label} has an unsupported value.`;
    default:
      return message;
  }
}

function fieldErrors(issues: readonly IssueLike[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : 'form';
    // First issue per field wins: the shallowest is the most actionable.
    if (errors[field] === undefined) errors[field] = friendly(field, issue.code, issue.message);
  }
  return errors;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** `key = value` per line → an attribute map. Rejects a line without a key and
 * a duplicated key, so nothing is silently dropped or overwritten. */
export function parseAttributes(
  text: string,
): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  const value: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const at = line.indexOf('=');
    const key = at === -1 ? '' : line.slice(0, at).trim();
    if (key === '') {
      return { ok: false, message: 'Each attribute line must look like "key = value".' };
    }
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return { ok: false, message: `Duplicate attribute "${key}".` };
    }
    value[key] = line.slice(at + 1).trim();
  }
  return { ok: true, value };
}

/** Attribute map → the `key = value` text the editor pre-fills. */
export function formatAttributes(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key} = ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('\n');
}

/** Major units ("12.99") → integer cents. String arithmetic only: a float
 * round-trip would silently turn 12.99 into 1298.9999... */
export function parsePrice(
  text: string,
): { ok: true; cents: number } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, message: 'Enter an amount in dollars, like 12.99.' };
  }
  const [whole = '0', fraction = ''] = trimmed.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, message: 'Enter an amount in dollars, like 12.99.' };
  }
  return { ok: true, cents };
}

/** Integer cents → the editable major-units text (exact, no float math). */
export function formatMajorUnits(cents: number): string {
  const whole = Math.floor(cents / 100);
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

export function validateProductCreate(values: ProductFormValues): Validated<ProductCreateRequest> {
  const errors: FieldErrors = {};
  const attributes = parseAttributes(values.attributes);
  if (!attributes.ok) errors['attributes'] = attributes.message;

  const parsed = productCreateRequest.safeParse({
    // No categories feed exists yet (T025 recorded the same limitation), so a
    // new product is uncategorised rather than pointed at a guessed id.
    categoryId: null,
    slug: values.slug.trim(),
    title: values.title.trim(),
    description: values.description,
    brand: emptyToNull(values.brand),
    attributes: attributes.ok ? attributes.value : {},
    currency: 'usd',
  });
  if (!parsed.success) Object.assign(errors, fieldErrors(parsed.error.issues));
  if (!parsed.success || !attributes.ok) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

export function validateProductUpdate(
  values: ProductFormValues,
  expectedVersion: number,
): Validated<ProductUpdateRequest> {
  const errors: FieldErrors = {};
  const attributes = parseAttributes(values.attributes);
  if (!attributes.ok) errors['attributes'] = attributes.message;

  // Slug is immutable (public URLs depend on it). categoryId is OMITTED, not
  // null: the console cannot choose a category yet, and sending null would
  // silently clear an assignment made by another surface.
  const patch: Record<string, unknown> = {
    expectedVersion,
    title: values.title.trim(),
    description: values.description,
    brand: emptyToNull(values.brand),
  };
  if (attributes.ok) patch['attributes'] = attributes.value;

  const parsed = productUpdateRequest.safeParse(patch);
  if (!parsed.success) Object.assign(errors, fieldErrors(parsed.error.issues));
  if (!parsed.success || !attributes.ok) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

export function validateVariantCreate(values: VariantFormValues): Validated<VariantCreateRequest> {
  const errors: FieldErrors = {};
  const attributes = parseAttributes(values.attributes);
  if (!attributes.ok) errors['attributes'] = attributes.message;
  const price = parsePrice(values.price);
  if (!price.ok) errors['priceCents'] = price.message;

  const parsed = variantCreateRequest.safeParse({
    sku: values.sku.trim(),
    priceCents: price.ok ? price.cents : 0,
    attributes: attributes.ok ? attributes.value : {},
  });
  if (!parsed.success) Object.assign(errors, fieldErrors(parsed.error.issues));
  if (!parsed.success || !attributes.ok || !price.ok) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

export function validateVariantUpdate(
  values: VariantFormValues,
  expectedVersion: number,
): Validated<VariantUpdateRequest> {
  const errors: FieldErrors = {};
  const attributes = parseAttributes(values.attributes);
  if (!attributes.ok) errors['attributes'] = attributes.message;
  const price = parsePrice(values.price);
  if (!price.ok) errors['priceCents'] = price.message;

  // SKU is immutable: variantUpdateRequest has no sku field, and changing it
  // would break every order line that references the variant.
  const parsed = variantUpdateRequest.safeParse({
    expectedVersion,
    priceCents: price.ok ? price.cents : 0,
    attributes: attributes.ok ? attributes.value : {},
    status: values.status,
  });
  if (!parsed.success) Object.assign(errors, fieldErrors(parsed.error.issues));
  if (!parsed.success || !attributes.ok || !price.ok) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}
