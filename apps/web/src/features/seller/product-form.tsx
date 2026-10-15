'use client';

// @shopscale/web features/seller/product-form - Product fields (T027c).
// The create form (product === null) and the edit form are the same component
// because they are the same decision for the seller.
//
// Validation is NOT done here: `noValidate` keeps the browser's built-in
// bubble out of the way and the summary/inline errors come from the server
// action, which validates with the same contract the API enforces. That is the
// point of the panel — a seller sees exactly what the server refused, with
// their typing intact, and a client that skips the form still cannot skip the
// rules.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ProductResponse } from '@shopscale/contracts';
import { Card, PrimaryButton, TextAreaField, TextField } from '@/components/ui';
import { saveProduct } from '@/features/seller/actions';
import {
  formatAttributes,
  type FieldErrors,
  type ProductFormValues,
} from '@/features/seller/validation';
import { ActionNotice, ConflictNotice } from '@/features/seller/notices';

export interface ProductFormProps {
  storeId: string;
  /** `null` creates a product; a product edits it in place. */
  product: ProductResponse | null;
  /** Edit mode only: hands the saved product to the workspace so every panel
   * shares one current version. */
  onSaved?: ((product: ProductResponse) => void) | undefined;
}

function initialValues(product: ProductResponse | null): ProductFormValues {
  if (product === null) {
    return { slug: '', title: '', description: '', brand: '', attributes: '' };
  }
  return {
    slug: product.slug,
    title: product.title,
    description: product.description,
    brand: product.brand ?? '',
    attributes: formatAttributes(product.attributes),
  };
}

export function ProductForm({ storeId, product, onSaved }: ProductFormProps) {
  const router = useRouter();
  const editing = product !== null;
  const [values, setValues] = useState<ProductFormValues>(() => initialValues(product));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ message: string; current: ProductResponse | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  function change(field: keyof ProductFormValues) {
    return (value: string) => {
      setValues((previous) => ({ ...previous, [field]: value }));
      // Fixing a field clears its message: the next save re-validates anyway.
      setErrors((previous) => {
        if (previous[field] === undefined) return previous;
        const next = { ...previous };
        delete next[field];
        return next;
      });
    };
  }

  async function submit(retryVersion?: number) {
    setBusy(true);
    setNotice(null);
    setConflict(null);
    setErrors({});
    // The version comes from the product the workspace owns, never from a copy
    // kept here: a variant write bumps it, and a cached copy would make the
    // next save fail with a conflict the seller did not cause.
    const expectedVersion = retryVersion ?? (product === null ? null : product.version);
    const state = await saveProduct({
      storeId,
      productId: product?.id ?? null,
      expectedVersion: editing ? expectedVersion : null,
      values,
    });
    setBusy(false);

    switch (state.status) {
      case 'saved':
        if (editing) {
          onSaved?.(state.product);
          setNotice({ tone: 'ok', text: 'Saved.' });
        } else {
          router.push(`/seller/${storeId}/products/${state.product.id}`);
        }
        return;
      case 'invalid':
        setErrors(state.errors);
        setNotice({ tone: 'error', text: 'Check the highlighted fields.' });
        return;
      case 'conflict':
        if (!editing) {
          // A create has no version to conflict with, so a 409 here is the
          // scoped unique key: it belongs on the slug, not in a reload panel.
          setErrors({ slug: state.message });
          setNotice({ tone: 'error', text: 'Check the highlighted fields.' });
          return;
        }
        setConflict({ message: state.message, current: state.current });
        return;
      case 'not-found':
        setNotice({ tone: 'error', text: 'This product is not available to your account.' });
        return;
      case 'unauthenticated':
        setNotice({ tone: 'error', text: 'Your session has expired. Sign in again to continue.' });
        return;
      default:
        setNotice({
          tone: 'error',
          text: 'We could not reach the catalog just now. Please try again shortly.',
        });
    }
  }

  const errorEntries = Object.entries(errors);
  const heading = editing ? 'Product details' : 'Create a product';

  return (
    <Card className="ss-form-card">
      <form
        className="ss-form"
        aria-labelledby="product-form-title"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h3 id="product-form-title" className="type-h3">
          {heading}
        </h3>

        {errorEntries.length > 0 ? (
          <div className="ss-form__summary" role="alert">
            <p>{`${errorEntries.length} field${errorEntries.length === 1 ? '' : 's'} need attention:`}</p>
            <ul>
              {errorEntries.map(([field, message]) => (
                <li key={field}>
                  <a href={`#${field}`}>{message}</a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <TextField
          label="Title"
          name="title"
          value={values.title}
          onChange={change('title')}
          error={errors['title']}
        />

        {editing ? (
          <p className="ss-hint">
            Web address: <code>/{product?.slug}</code> — this cannot change after a product is
            created.
          </p>
        ) : (
          <TextField
            label="Web address (slug)"
            name="slug"
            value={values.slug}
            onChange={change('slug')}
            error={errors['slug']}
          />
        )}

        <TextAreaField
          label="Description"
          name="description"
          value={values.description}
          onChange={change('description')}
          rows={4}
          error={errors['description']}
        />

        <TextField
          label="Brand"
          name="brand"
          value={values.brand}
          onChange={change('brand')}
          required={false}
          error={errors['brand']}
        />

        <TextAreaField
          label="Attributes"
          name="attributes"
          value={values.attributes}
          onChange={change('attributes')}
          rows={3}
          hint='One per line, like "color = Black".'
          error={errors['attributes']}
        />

        <div className="ss-form__actions">
          <PrimaryButton type="submit" loading={busy}>
            {editing ? 'Save changes' : 'Create product'}
          </PrimaryButton>
        </div>

        {notice ? <ActionNotice tone={notice.tone}>{notice.text}</ActionNotice> : null}

        {conflict ? (
          <ConflictNotice
            message={conflict.message}
            onReload={
              conflict.current
                ? () => {
                    setValues(initialValues(conflict.current));
                    setConflict(null);
                    setNotice({ tone: 'ok', text: 'Loaded the latest version.' });
                  }
                : undefined
            }
            onApply={
              conflict.current
                ? () => void submit(conflict.current?.version)
                : undefined
            }
          />
        ) : null}
      </form>
    </Card>
  );
}
